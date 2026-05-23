const VALID_CATEGORIES = new Set(['friends', 'family', 'standup', 'concerts']);

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);

        if (url.pathname.startsWith('/api/')) {
            return this.handleApiRequest(request, env, url);
        }

        return env.ASSETS.fetch(request);
    },

    async handleApiRequest(request, env, url) {
        const method = request.method;

        // GET /api/items?category=X
        if (method === 'GET' && url.pathname === '/api/items') {
            return this.listItems(request, env, url);
        }

        // POST /api/items
        if (method === 'POST' && url.pathname === '/api/items') {
            return this.createItem(request, env);
        }

        // PUT /api/items/:id
        if (method === 'PUT' && url.pathname.startsWith('/api/items/')) {
            const id = url.pathname.slice('/api/items/'.length);
            return this.updateItem(request, env, id);
        }

        // DELETE /api/items/:id
        if (method === 'DELETE' && url.pathname.startsWith('/api/items/')) {
            const id = url.pathname.slice('/api/items/'.length);
            return this.deleteItem(env, id);
        }

        return json({ error: 'Unknown API endpoint' }, 404);
    },

    async listItems(request, env, url) {
        const category = url.searchParams.get('category');

        if (!category || !VALID_CATEGORIES.has(category)) {
            return json({ error: 'Valid category is required' }, 400);
        }

        const { results } = await env.DB.prepare(
            'SELECT * FROM items WHERE category = ? ORDER BY date DESC'
        ).bind(category).all();

        return json({ items: results });
    },

    async createItem(request, env) {
        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: 'Invalid JSON body' }, 400);
        }

        const { id, category, description, date, notes } = body;

        if (!id || typeof id !== 'string') return json({ error: 'id is required' }, 400);
        if (!category || !VALID_CATEGORIES.has(category)) return json({ error: 'Valid category is required' }, 400);
        if (!description || typeof description !== 'string') return json({ error: 'description is required' }, 400);
        if (!date || typeof date !== 'string') return json({ error: 'date is required' }, 400);

        const now = new Date().toISOString();

        await env.DB.prepare(
            'INSERT INTO items (id, category, description, date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
        // notes: empty string is treated as null — both mean "no notes"
        ).bind(id, category, description.trim(), date, notes || null, now, now).run();

        const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
        return json({ item }, 201);
    },

    async updateItem(request, env, id) {
        if (!id) return json({ error: 'id is required' }, 400);

        let body;
        try {
            body = await request.json();
        } catch {
            return json({ error: 'Invalid JSON body' }, 400);
        }

        const existing = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
        if (!existing) return json({ error: 'Item not found' }, 404);

        const description = 'description' in body ? body.description : existing.description;
        const date = 'date' in body ? body.date : existing.date;
        const notes = 'notes' in body ? body.notes : existing.notes;

        if (!description || typeof description !== 'string') return json({ error: 'description cannot be empty' }, 400);
        if (!date || typeof date !== 'string') return json({ error: 'date cannot be empty' }, 400);

        const now = new Date().toISOString();

        await env.DB.prepare(
            'UPDATE items SET description = ?, date = ?, notes = ?, updated_at = ? WHERE id = ?'
        // notes: empty string is treated as null — both mean "no notes"
        ).bind(description.trim(), date, notes || null, now, id).run();

        const item = await env.DB.prepare('SELECT * FROM items WHERE id = ?').bind(id).first();
        return json({ item });
    },

    async deleteItem(env, id) {
        if (!id) return json({ error: 'id is required' }, 400);

        const existing = await env.DB.prepare('SELECT id FROM items WHERE id = ?').bind(id).first();
        if (!existing) return json({ error: 'Item not found' }, 404);

        await env.DB.prepare('DELETE FROM items WHERE id = ?').bind(id).run();
        return json({ success: true });
    },
};
