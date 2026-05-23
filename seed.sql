-- Local dev seed data. Apply with:
--   npx wrangler d1 execute seen --local --file=seed.sql

INSERT OR IGNORE INTO categories (id, name, label, sort_order) VALUES
    ('cat-friends',  'friends',  'Friends',       1),
    ('cat-family',   'family',   'Family',        2),
    ('cat-standup',  'standup',  'Standup Shows', 3),
    ('cat-concerts', 'concerts', 'Concerts',      4);

INSERT OR IGNORE INTO items (id, category, description, date, notes, created_at, updated_at) VALUES
    ('a1b2c3d4-e5f6-4a7b-8c9d-e0f1a2b3c4d5', 'friends', 'Alice',        '2026-04-12', 'Grabbed coffee downtown', '2026-04-12T10:00:00Z', '2026-04-12T10:00:00Z'),
    ('b2c3d4e5-f6a7-4b8c-9d0e-f1a2b3c4d5e6', 'friends', 'Bob',          '2026-03-28', null,                      '2026-03-28T18:00:00Z', '2026-03-28T18:00:00Z'),
    ('c3d4e5f6-a7b8-4c9d-ae1f-a2b3c4d5e6f7', 'friends', 'Carol',        '2026-02-14', 'Valentine dinner',        '2026-02-14T19:00:00Z', '2026-02-14T19:00:00Z'),
    ('d4e5f6a7-b8c9-4d0e-bf2a-b3c4d5e6f7a8', 'family',  'Mom',          '2026-05-10', 'Mother''s Day brunch',    '2026-05-10T12:00:00Z', '2026-05-10T12:00:00Z'),
    ('e5f6a7b8-c9d0-4e1f-8a3b-c4d5e6f7a8b9', 'family',  'Brother Dave', '2026-01-02', null,                      '2026-01-02T14:00:00Z', '2026-01-02T14:00:00Z'),
    ('f6a7b8c9-d0e1-4f2a-9b4c-d5e6f7a8b9c0', 'standup', 'John Mulaney', '2026-03-15', 'Baby J tour',             '2026-03-15T20:00:00Z', '2026-03-15T20:00:00Z'),
    ('a7b8c9d0-e1f2-4a3b-8c5d-e6f7a8b9c0d1', 'standup', 'Bo Burnham',   '2025-11-20', null,                      '2025-11-20T20:00:00Z', '2025-11-20T20:00:00Z'),
    ('b8c9d0e1-f2a3-4b4c-9d6e-f7a8b9c0d1e2', 'concerts','Phoebe Bridgers','2026-04-05','Great setlist',           '2026-04-05T21:00:00Z', '2026-04-05T21:00:00Z'),
    ('c9d0e1f2-a3b4-4c5d-ae7f-a8b9c0d1e2f3', 'concerts','Hozier',        '2025-09-18', null,                     '2025-09-18T21:00:00Z', '2025-09-18T21:00:00Z'),
    ('d0e1f2a3-b4c5-4d6e-bf8a-b9c0d1e2f3a4', 'concerts','Boygenius',     '2025-07-04', 'Outdoor festival',       '2025-07-04T17:00:00Z', '2025-07-04T17:00:00Z');
