import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono();

const onInvalid = (result, c) => {
    if (!result.success) {
        const message = result.error.issues.map((i) => i.message).join('; ') || 'Invalid input';
        return c.json({ error: message }, 400);
    }
};

const categoryCreate = z.object({
    id: z.string().min(1, { message: 'id is required' }),
    label: z.string().trim().min(1, { message: 'label is required' }),
});

const dateField = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' });

const itemCreate = z.object({
    id: z.string().min(1, { message: 'id is required' }),
    category: z.string().min(1, { message: 'category is required' }),
    description: z.string().trim().min(1, { message: 'description is required' }),
    date: dateField,
    notes: z.string().nullish(),
});

const itemUpdate = z
    .object({
        description: z
            .string()
            .trim()
            .min(1, { message: 'description cannot be empty' })
            .optional(),
        date: dateField.optional(),
        notes: z.string().nullish(),
    })
    .refine((b) => 'description' in b || 'date' in b || 'notes' in b, {
        message: 'At least one field is required',
    });

// D1 doesn't expose structured SQLite error codes, so UNIQUE violations are
// detected by message text. If the message format ever changes, these paths
// degrade from 409 to 500 (the error is rethrown), not to silent corruption.
const isUniqueViolation = (err) => String(err.message).includes('UNIQUE constraint failed');

app.onError((err, c) => {
    if (
        err instanceof HTTPException &&
        err.status === 400 &&
        err.message === 'Malformed JSON in request body'
    ) {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }
    throw err;
});

app.get('/api/categories', async (c) => {
    const { results } = await c.env.DB.prepare(
        'SELECT * FROM categories ORDER BY sort_order ASC, label ASC',
    ).all();
    return c.json({ categories: results });
});

app.post('/api/categories', zValidator('json', categoryCreate, onInvalid), async (c) => {
    const { id, label } = c.req.valid('json');
    const name = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    if (!name)
        return c.json({ error: 'Label must contain at least one alphanumeric character' }, 400);

    try {
        const category = await c.env.DB.prepare(
            `INSERT INTO categories (id, name, label, sort_order)
             VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM categories))
             RETURNING *`,
        )
            .bind(id, name, label)
            .first();
        return c.json({ category }, 201);
    } catch (err) {
        if (isUniqueViolation(err)) {
            // Both id (PK) and name (UNIQUE) can collide; the SQLite message names the column.
            const field = String(err.message).includes('categories.id') ? 'id' : 'name';
            return c.json({ error: `A category with this ${field} already exists` }, 409);
        }
        throw err;
    }
});

app.delete('/api/categories/:id', async (c) => {
    const id = c.req.param('id');
    // The has-items check lives inside the DELETE so an item created
    // concurrently can't be orphaned by a check-then-delete race.
    const deleted = await c.env.DB.prepare(
        `DELETE FROM categories
         WHERE id = ? AND NOT EXISTS (SELECT 1 FROM items WHERE category = categories.name)
         RETURNING id`,
    )
        .bind(id)
        .first();
    if (deleted) return c.json({ success: true });

    const existing = await c.env.DB.prepare('SELECT 1 FROM categories WHERE id = ?')
        .bind(id)
        .first();
    if (!existing) return c.json({ error: 'Category not found' }, 404);
    return c.json({ error: 'Cannot delete a category that has items' }, 409);
});

app.get('/api/items', async (c) => {
    const category = c.req.query('category');
    if (!category) return c.json({ error: 'category query param is required' }, 400);

    const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE name = ?')
        .bind(category)
        .first();
    if (!cat) return c.json({ error: `Unknown category: ${category}` }, 400);

    const { results } = await c.env.DB.prepare(
        'SELECT * FROM items WHERE category = ? ORDER BY date DESC, created_at DESC',
    )
        .bind(category)
        .all();
    return c.json({ items: results });
});

app.post('/api/items', zValidator('json', itemCreate, onInvalid), async (c) => {
    const { id, category, description, date, notes } = c.req.valid('json');

    // Not atomic with the INSERT below (no FK is enforced): the category can be
    // deleted in between, orphaning this item. Accepted for a single-user app.
    const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE name = ?')
        .bind(category)
        .first();
    if (!cat) return c.json({ error: `Unknown category: ${category}` }, 400);

    const now = new Date().toISOString();
    try {
        const item = await c.env.DB.prepare(
            'INSERT INTO items (id, category, description, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *',
        )
            .bind(id, category, description, date, notes || null, now, now)
            .first();
        return c.json({ item }, 201);
    } catch (err) {
        if (isUniqueViolation(err)) {
            return c.json({ error: 'An item with this id already exists' }, 409);
        }
        throw err;
    }
});

app.put('/api/items/:id', zValidator('json', itemUpdate, onInvalid), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Item not found' }, 404);

    // Read-merge-write: concurrent PUTs to the same item can interleave, and the
    // later one overwrites with fields merged from a stale read. A single-statement
    // COALESCE merge can't express "explicitly clear notes", so this is accepted
    // for a single-user app.
    const description = 'description' in body ? body.description : existing.description;
    const date = 'date' in body ? body.date : existing.date;
    const notes = 'notes' in body ? body.notes : existing.notes;

    const now = new Date().toISOString();
    const item = await c.env.DB.prepare(
        'UPDATE items SET description = ?, date = ?, notes = ?, updated_at = ? WHERE id = ? RETURNING *',
    )
        .bind(description, date, notes || null, now, id)
        .first();
    // The row can vanish between the SELECT above and this UPDATE.
    if (!item) return c.json({ error: 'Item not found' }, 404);
    return c.json({ item });
});

app.delete('/api/items/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM items WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Item not found' }, 404);

    await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// Hono has already matched every declared route by this point, so a request
// whose path matches a real endpoint only got here because of its method.
// Reporting that as an unknown endpoint sends debugging the wrong way.
const API_ROUTES = [
    { pattern: /^\/api\/categories$/, methods: ['GET', 'POST'] },
    { pattern: /^\/api\/categories\/[^/]+$/, methods: ['DELETE'] },
    { pattern: /^\/api\/items$/, methods: ['GET', 'POST'] },
    { pattern: /^\/api\/items\/[^/]+$/, methods: ['PUT', 'DELETE'] },
];

app.all('/api/*', (c) => {
    const path = new URL(c.req.url).pathname;
    const route = API_ROUTES.find((r) => r.pattern.test(path));
    if (route) {
        return c.json({ error: `Method not allowed; try ${route.methods.join(', ')}` }, 405, {
            Allow: route.methods.join(', '),
        });
    }
    return c.json({ error: 'Unknown API endpoint' }, 404);
});

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
