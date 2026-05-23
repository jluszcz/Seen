# Seen

A personal tracker for things you've seen — friends, family, shows, concerts, or any custom category. Built on Cloudflare Workers with a D1 SQLite database and protected by Cloudflare Access.

## Features

- Track items across user-defined categories
- Inline cell editing — click to edit, Enter/blur to save, Escape to cancel
- Notes column auto-hides when all values in a category are empty
- Sortable columns, client-side pagination (25 rows/page)
- Categories are fully dynamic — add or remove them from the UI
- Zero-code authentication via Cloudflare Access

## Stack

| Layer | Technology |
|---|---|
| Backend | Cloudflare Workers (vanilla JS) |
| Database | Cloudflare D1 (SQLite) |
| Frontend | Vanilla HTML/CSS/JS |
| Auth | Cloudflare Access |
| Testing | Vitest + `@cloudflare/vitest-pool-workers` |

## Getting Started

### Prerequisites

- Node.js and npm
- A Cloudflare account with Workers and D1 access

### Setup

```bash
npm install

# Create the D1 database (first time only)
npx wrangler d1 create seen
# Paste the database_id output into wrangler.toml

# Apply schema locally
npx wrangler d1 migrations apply seen --local

# Apply schema to production
npx wrangler d1 migrations apply seen

# (Optional) Seed local dev data
npx wrangler d1 execute seen --local --file=seed.sql

# Start dev server
npm run dev
```

### Syncing production data to local

```bash
npx wrangler d1 export seen --output=prod.sql
npx wrangler d1 execute seen --local --file=prod.sql
```

### Running tests

```bash
npm test
```

### Deploy

```bash
npm run deploy
```

## API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/categories` | List all categories |
| `POST` | `/api/categories` | Create a category |
| `DELETE` | `/api/categories/:id` | Delete a category (must be empty) |
| `GET` | `/api/items?category=X` | List items for a category |
| `POST` | `/api/items` | Create an item |
| `PUT` | `/api/items/:id` | Update an item |
| `DELETE` | `/api/items/:id` | Delete an item |

## Database Schema

**`categories`** — user-defined tabs

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID, client-generated |
| `name` | TEXT UNIQUE | URL-safe slug derived from label |
| `label` | TEXT | Display name |
| `sort_order` | INTEGER | Tab order |

**`items`** — tracked entries

| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | UUID, client-generated |
| `category` | TEXT | References a category `name` |
| `description` | TEXT | Required |
| `date` | TEXT | ISO date (`YYYY-MM-DD`) |
| `notes` | TEXT | Optional; empty string treated as NULL |
| `created_at` | TEXT | ISO timestamp |
| `updated_at` | TEXT | ISO timestamp |

## Authentication

Authentication is handled entirely by Cloudflare Access at the edge — no application code required. Configure a self-hosted application in the Cloudflare dashboard and point it at your Worker's domain. Local development bypasses auth automatically.

## Cost

Designed to run within Cloudflare's free tier for personal use:

- **Workers**: 100,000 requests/day
- **D1**: 5M reads/day, 100K writes/day, 5 GB storage
- **Access**: up to 50 users

## License

MIT
