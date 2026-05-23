import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

const app = new Hono();

const onInvalid = (result, c) => {
    if (!result.success) {
        const message = result.error.issues.map(i => i.message).join('; ') || 'Invalid input';
        return c.json({ error: message }, 400);
    }
};

const categoryCreate = z.object({
    id: z.string().min(1, { message: 'id is required' }),
    label: z.string().min(1, { message: 'label is required' }),
});

const itemCreate = z.object({
    id: z.string().min(1, { message: 'id is required' }),
    category: z.string().min(1, { message: 'category is required' }),
    description: z.string().min(1, { message: 'description is required' }),
    date: z.string().min(1, { message: 'date is required' }),
    notes: z.string().nullish(),
});

const itemUpdate = z.object({
    description: z.string().min(1, { message: 'description cannot be empty' }).optional(),
    date: z.string().min(1, { message: 'date cannot be empty' }).optional(),
    notes: z.string().nullish(),
}).refine(
    b => 'description' in b || 'date' in b || 'notes' in b,
    { message: 'At least one field is required' },
);

app.onError((err, c) => {
    if (err instanceof HTTPException && err.status === 400 && err.message === 'Malformed JSON in request body') {
        return c.json({ error: 'Invalid JSON body' }, 400);
    }
    throw err;
});

app.get('/api/categories', async (c) => {
    const { results } = await c.env.DB.prepare(
        'SELECT * FROM categories ORDER BY sort_order ASC, label ASC'
    ).all();
    return c.json({ categories: results });
});

app.post('/api/categories', zValidator('json', categoryCreate, onInvalid), async (c) => {
    const { id, label } = c.req.valid('json');
    const name = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    if (!name) return c.json({ error: 'Label must contain at least one alphanumeric character' }, 400);

    const existing = await c.env.DB.prepare('SELECT id FROM categories WHERE name = ?').bind(name).first();
    if (existing) return c.json({ error: 'A category with this name already exists' }, 409);

    const row = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM categories').first();
    const sortOrder = row.max_order + 1;

    await c.env.DB.prepare(
        'INSERT INTO categories (id, name, label, sort_order) VALUES (?, ?, ?, ?)'
    ).bind(id, name, label.trim(), sortOrder).run();

    const category = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
    return c.json({ category }, 201);
});

app.delete('/api/categories/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT * FROM categories WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Category not found' }, 404);

    const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM items WHERE category = ?').bind(existing.name).first();
    if (row.count > 0) return c.json({ error: 'Cannot delete a category that has items' }, 409);

    await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

app.get('/api/items', async (c) => {
    const category = c.req.query('category');
    if (!category) return c.json({ error: 'category query param is required' }, 400);

    const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE name = ?').bind(category).first();
    if (!cat) return c.json({ error: `Unknown category: ${category}` }, 400);

    const { results } = await c.env.DB.prepare(
        'SELECT * FROM items WHERE category = ? ORDER BY date DESC'
    ).bind(category).all();
    return c.json({ items: results });
});

app.post('/api/items', zValidator('json', itemCreate, onInvalid), async (c) => {
    const { id, category, description, date, notes } = c.req.valid('json');

    const cat = await c.env.DB.prepare('SELECT id FROM categories WHERE name = ?').bind(category).first();
    if (!cat) return c.json({ error: `Unknown category: ${category}` }, 400);

    const now = new Date().toISOString();
    await c.env.DB.prepare(
        'INSERT INTO items (id, category, description, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(id, category, description.trim(), date, notes || null, now, now).run();

    const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    return c.json({ item }, 201);
});

app.put('/api/items/:id', zValidator('json', itemUpdate, onInvalid), async (c) => {
    const id = c.req.param('id');
    const body = c.req.valid('json');

    const existing = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Item not found' }, 404);

    const description = 'description' in body ? body.description : existing.description;
    const date = 'date' in body ? body.date : existing.date;
    const notes = 'notes' in body ? body.notes : existing.notes;

    const now = new Date().toISOString();
    await c.env.DB.prepare(
        'UPDATE items SET description = ?, date = ?, notes = ?, updated_at = ? WHERE id = ?'
    ).bind(description.trim(), date, notes || null, now, id).run();

    const item = await c.env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
    return c.json({ item });
});

app.delete('/api/items/:id', async (c) => {
    const id = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT id FROM items WHERE id = ?').bind(id).first();
    if (!existing) return c.json({ error: 'Item not found' }, 404);

    await c.env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

app.all('/api/*', (c) => c.json({ error: 'Unknown API endpoint' }, 404));

app.all('*', (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
