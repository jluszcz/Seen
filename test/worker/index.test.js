import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { env } from 'cloudflare:test';
import worker from '../../src/index.js';

const mockAssetsFetch = vi.fn().mockResolvedValue(new Response('index.html'));

function makeEnv() {
    return { ...env, ASSETS: { fetch: mockAssetsFetch }, DB: env.DB };
}

async function req(method, path, body) {
    const init = { method };
    if (body) {
        init.body = JSON.stringify(body);
        init.headers = { 'Content-Type': 'application/json' };
    }
    return worker.fetch(new Request(`https://example.com${path}`, init), makeEnv());
}

beforeAll(async () => {
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS categories (
            id         TEXT PRIMARY KEY,
            name       TEXT UNIQUE NOT NULL,
            label      TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
    `).run();
    await env.DB.prepare(`
        CREATE TABLE IF NOT EXISTS items (
            id          TEXT PRIMARY KEY,
            category    TEXT NOT NULL,
            description TEXT NOT NULL,
            date        TEXT NOT NULL,
            notes       TEXT,
            created_at  TEXT NOT NULL,
            updated_at  TEXT NOT NULL
        )
    `).run();
});

beforeEach(async () => {
    await env.DB.exec('DELETE FROM items');
    await env.DB.exec('DELETE FROM categories');
    await env.DB.prepare(
        "INSERT INTO categories (id, name, label, sort_order) VALUES ('cat-friends', 'friends', 'Friends', 1)"
    ).run();
    await env.DB.prepare(
        "INSERT INTO categories (id, name, label, sort_order) VALUES ('cat-family', 'family', 'Family', 2)"
    ).run();
    await env.DB.prepare(
        "INSERT INTO categories (id, name, label, sort_order) VALUES ('cat-standup', 'standup', 'Standup Shows', 3)"
    ).run();
    await env.DB.prepare(
        "INSERT INTO categories (id, name, label, sort_order) VALUES ('cat-concerts', 'concerts', 'Concerts', 4)"
    ).run();
});

// ---------------------------------------------------------------------------
// Static assets
// ---------------------------------------------------------------------------

describe('static assets', () => {
    it('serves / via ASSETS', async () => {
        const response = await req('GET', '/');
        expect(mockAssetsFetch).toHaveBeenCalled();
        expect(await response.text()).toBe('index.html');
    });

    it('returns 404 JSON for unknown /api/* paths', async () => {
        const response = await req('GET', '/api/nope');
        expect(response.status).toBe(404);
        expect((await response.json()).error).toBe('Unknown API endpoint');
    });
});

// ---------------------------------------------------------------------------
// GET /api/categories
// ---------------------------------------------------------------------------

describe('GET /api/categories', () => {
    it('returns all seeded categories ordered by sort_order', async () => {
        const r = await req('GET', '/api/categories');
        expect(r.status).toBe(200);
        const { categories } = await r.json();
        expect(categories).toHaveLength(4);
        expect(categories[0].name).toBe('friends');
        expect(categories[3].name).toBe('concerts');
    });

    it('returns empty array when no categories exist', async () => {
        await env.DB.exec('DELETE FROM categories');
        const r = await req('GET', '/api/categories');
        expect(r.status).toBe(200);
        expect((await r.json()).categories).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// POST /api/categories
// ---------------------------------------------------------------------------

describe('POST /api/categories', () => {
    it('creates a category and returns 201', async () => {
        const r = await req('POST', '/api/categories', { id: 'cat-new', label: 'Movies' });
        expect(r.status).toBe(201);
        const { category } = await r.json();
        expect(category.id).toBe('cat-new');
        expect(category.label).toBe('Movies');
        expect(category.name).toBe('movies');
    });

    it('derives name slug from label', async () => {
        const r = await req('POST', '/api/categories', { id: 'cat-tv', label: 'TV Shows' });
        expect(r.status).toBe(201);
        expect((await r.json()).category.name).toBe('tv-shows');
    });

    it('assigns sort_order after existing categories', async () => {
        const r = await req('POST', '/api/categories', { id: 'cat-x', label: 'Extra' });
        expect((await r.json()).category.sort_order).toBe(5);
    });

    it('returns 400 when label is missing', async () => {
        const r = await req('POST', '/api/categories', { id: 'cat-x' });
        expect(r.status).toBe(400);
    });

    it('returns 400 when id is missing', async () => {
        const r = await req('POST', '/api/categories', { label: 'Oops' });
        expect(r.status).toBe(400);
    });

    it('returns 409 when category name already exists', async () => {
        const r = await req('POST', '/api/categories', { id: 'cat-dup', label: 'Friends' });
        expect(r.status).toBe(409);
    });

    it('returns 400 for malformed JSON body', async () => {
        const r = await worker.fetch(
            new Request('https://example.com/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: 'not-json',
            }),
            makeEnv()
        );
        expect(r.status).toBe(400);
        expect((await r.json()).error).toBe('Invalid JSON body');
    });
});

// ---------------------------------------------------------------------------
// DELETE /api/categories/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/categories/:id', () => {
    it('deletes a category with no items', async () => {
        const r = await req('DELETE', '/api/categories/cat-concerts');
        expect(r.status).toBe(200);
        expect((await r.json()).success).toBe(true);
    });

    it('category is no longer returned after deletion', async () => {
        await req('DELETE', '/api/categories/cat-concerts');
        const { categories } = await (await req('GET', '/api/categories')).json();
        expect(categories.find(c => c.name === 'concerts')).toBeUndefined();
    });

    it('returns 404 for unknown id', async () => {
        const r = await req('DELETE', '/api/categories/ghost');
        expect(r.status).toBe(404);
    });

    it('returns 409 when category has items', async () => {
        await req('POST', '/api/items', { id: 'i1', category: 'friends', description: 'Alice', date: '2026-01-01' });
        const r = await req('DELETE', '/api/categories/cat-friends');
        expect(r.status).toBe(409);
    });
});

// ---------------------------------------------------------------------------
// GET /api/items
// ---------------------------------------------------------------------------

describe('GET /api/items', () => {
    it('returns 400 without category', async () => {
        const r = await req('GET', '/api/items');
        expect(r.status).toBe(400);
    });

    it('returns 400 for category not in categories table', async () => {
        const r = await req('GET', '/api/items?category=movies');
        expect(r.status).toBe(400);
    });

    it('returns empty array when no items', async () => {
        const r = await req('GET', '/api/items?category=friends');
        expect(r.status).toBe(200);
        expect((await r.json()).items).toEqual([]);
    });

    it('returns only items for the requested category', async () => {
        await req('POST', '/api/items', { id: 'a', category: 'friends', description: 'Alice', date: '2026-01-01' });
        await req('POST', '/api/items', { id: 'b', category: 'family', description: 'Bob', date: '2026-01-02' });

        const r = await req('GET', '/api/items?category=friends');
        const { items } = await r.json();
        expect(items).toHaveLength(1);
        expect(items[0].description).toBe('Alice');
    });

    it('returns items ordered by date descending', async () => {
        await req('POST', '/api/items', { id: 'x1', category: 'concerts', description: 'Old', date: '2025-01-01' });
        await req('POST', '/api/items', { id: 'x2', category: 'concerts', description: 'New', date: '2026-05-01' });

        const { items } = await (await req('GET', '/api/items?category=concerts')).json();
        expect(items[0].description).toBe('New');
        expect(items[1].description).toBe('Old');
    });
});

// ---------------------------------------------------------------------------
// POST /api/items
// ---------------------------------------------------------------------------

describe('POST /api/items', () => {
    it('creates an item and returns 201', async () => {
        const r = await req('POST', '/api/items', {
            id: 'new1', category: 'standup', description: 'John Mulaney', date: '2026-03-15', notes: 'Great show',
        });
        expect(r.status).toBe(201);
        const { item } = await r.json();
        expect(item.id).toBe('new1');
        expect(item.description).toBe('John Mulaney');
        expect(item.notes).toBe('Great show');
    });

    it('stores null notes when omitted', async () => {
        await req('POST', '/api/items', { id: 'n2', category: 'friends', description: 'Carol', date: '2026-02-01' });
        const { items } = await (await req('GET', '/api/items?category=friends')).json();
        expect(items[0].notes).toBeNull();
    });

    it('returns 400 when description is missing', async () => {
        const r = await req('POST', '/api/items', { id: 'n3', category: 'friends', date: '2026-01-01' });
        expect(r.status).toBe(400);
    });

    it('returns 400 when date is missing', async () => {
        const r = await req('POST', '/api/items', { id: 'n4', category: 'friends', description: 'Dave' });
        expect(r.status).toBe(400);
    });

    it('returns 400 for category not in categories table', async () => {
        const r = await req('POST', '/api/items', { id: 'n5', category: 'movies', description: 'X', date: '2026-01-01' });
        expect(r.status).toBe(400);
    });
});

// ---------------------------------------------------------------------------
// PUT /api/items/:id
// ---------------------------------------------------------------------------

describe('PUT /api/items/:id', () => {
    beforeEach(async () => {
        await req('POST', '/api/items', { id: 'upd1', category: 'family', description: 'Mom', date: '2026-05-01' });
    });

    it('updates description', async () => {
        const r = await req('PUT', '/api/items/upd1', { description: 'Mother' });
        expect(r.status).toBe(200);
        expect((await r.json()).item.description).toBe('Mother');
    });

    it('updates notes', async () => {
        const r = await req('PUT', '/api/items/upd1', { notes: 'Added a note' });
        expect((await r.json()).item.notes).toBe('Added a note');
    });

    it('clears notes when set to null', async () => {
        await req('PUT', '/api/items/upd1', { notes: 'Some note' });
        const r = await req('PUT', '/api/items/upd1', { notes: null });
        expect((await r.json()).item.notes).toBeNull();
    });

    it('returns 404 for unknown id', async () => {
        const r = await req('PUT', '/api/items/ghost', { description: 'X' });
        expect(r.status).toBe(404);
    });

    it('returns 400 when description is cleared', async () => {
        const r = await req('PUT', '/api/items/upd1', { description: '' });
        expect(r.status).toBe(400);
    });

    it('returns 400 for an empty body (no fields provided)', async () => {
        const r = await req('PUT', '/api/items/upd1', {});
        expect(r.status).toBe(400);
        expect((await r.json()).error).toMatch(/at least one field/i);
    });
});

// ---------------------------------------------------------------------------
// DELETE /api/items/:id
// ---------------------------------------------------------------------------

describe('DELETE /api/items/:id', () => {
    beforeEach(async () => {
        await req('POST', '/api/items', { id: 'del1', category: 'concerts', description: 'Hozier', date: '2025-09-18' });
    });

    it('deletes an item and returns success', async () => {
        const r = await req('DELETE', '/api/items/del1');
        expect(r.status).toBe(200);
        expect((await r.json()).success).toBe(true);
    });

    it('item is no longer returned after deletion', async () => {
        await req('DELETE', '/api/items/del1');
        const { items } = await (await req('GET', '/api/items?category=concerts')).json();
        expect(items).toHaveLength(0);
    });

    it('returns 404 for unknown id', async () => {
        const r = await req('DELETE', '/api/items/ghost');
        expect(r.status).toBe(404);
    });
});
