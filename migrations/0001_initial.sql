CREATE TABLE items (
    id          TEXT PRIMARY KEY,
    category    TEXT NOT NULL CHECK (category IN ('friends', 'family', 'standup', 'concerts')),
    description TEXT NOT NULL,
    date        TEXT NOT NULL,
    notes       TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

CREATE INDEX idx_items_category ON items (category, date);
