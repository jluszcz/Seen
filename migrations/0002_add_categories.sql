CREATE TABLE categories (
    id         TEXT PRIMARY KEY,
    name       TEXT UNIQUE NOT NULL,
    label      TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
);

INSERT INTO categories (id, name, label, sort_order) VALUES
    ('cat-friends',  'friends',  'Friends',       1),
    ('cat-family',   'family',   'Family',        2),
    ('cat-standup',  'standup',  'Standup Shows', 3),
    ('cat-concerts', 'concerts', 'Concerts',      4);

-- SQLite can't DROP a CHECK constraint; recreate items without it
CREATE TABLE items_new (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL,
    description TEXT NOT NULL,
    date        TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

INSERT INTO items_new SELECT * FROM items;
DROP TABLE items;
ALTER TABLE items_new RENAME TO items;
CREATE INDEX idx_items_category ON items (category, date);
