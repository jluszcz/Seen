# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Seen** is a personal tracker for things you've seen across categories (Friends, Family, Standup Shows, Concerts). Built as a Cloudflare Workers application with a D1 (SQLite) database, static frontend assets, and Cloudflare Access for authentication.

## Repository Structure

- `public/` — Static frontend assets
  - `index.html` — Single-page application
  - `styles.css` — Minimal, neutral styling
  - `script.js` — `SeenApp` class managing all state and rendering
- `src/` — Cloudflare Workers backend
  - `index.js` — Worker handler + CRUD API for items
- `migrations/` — D1 SQL migrations (applied via wrangler)
- `test/` — Tests
  - `test/worker/` — Worker API tests (use `@cloudflare/vitest-pool-workers`)
  - `test/frontend/` — Frontend unit tests (logic only, no DOM)
- `seed.sql` — Representative seed data for local dev
- `wrangler.toml` — Cloudflare Workers configuration
- `package.json` — Dependencies and scripts

## Technology Stack

- **Backend**: Cloudflare Workers (vanilla JavaScript)
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES6+)
- **Authentication**: Cloudflare Access (zero-code, dashboard-configured)
- **Testing**: Vitest + `@cloudflare/vitest-pool-workers`
- **Build**: Wrangler CLI

## Development Setup

### Prerequisites
- Node.js and npm
- Cloudflare account with Workers and D1 access
- Wrangler CLI (installed as dev dependency)

### First-time setup
```bash
npm install

# Create the D1 database (once, in production)
npx wrangler d1 create seen
# Copy the database_id from the output into wrangler.toml

# Apply schema locally
npx wrangler d1 migrations apply seen --local

# Apply schema to production
npx wrangler d1 migrations apply seen

# Seed local dev data (optional but recommended)
npx wrangler d1 execute seen --local --file=seed.sql

# Start dev server
npm run dev
```

### Syncing prod data to local (optional)
```bash
npx wrangler d1 export seen --output=prod.sql
npx wrangler d1 execute seen --local --file=prod.sql
```

### Running tests
```bash
npm test
```

## Architecture Notes

### Authentication (Cloudflare Access)
- Zero-code solution — all auth handled in Cloudflare dashboard
- Edge-level protection — sits in front of Worker, no application code needed
- Only works in production; local dev bypasses auth

### Database Schema
Single `items` table:
- `id` — UUID primary key (generated client-side)
- `category` — one of: `friends`, `family`, `standup`, `concerts`
- `description` — required text
- `date` — required ISO date string (`YYYY-MM-DD`)
- `notes` — optional text (NULL if not set)
- `created_at`, `updated_at` — ISO timestamps

### API Routes
- `GET /api/items?category=X` — list all items for a category
- `POST /api/items` — create item (`{ id, category, description, date, notes }`)
- `PUT /api/items/:id` — update item fields
- `DELETE /api/items/:id` — delete item

### Frontend
- `SeenApp` class owns all state (current category, items, sort, filters, rendered count)
- Notes column is hidden per-category when all `notes` values are null
- Inline editing: click a cell → input appears; Enter/blur saves; Escape cancels
- Per-column filters in a second header row; date filter matches both ISO (`2026-01`) and locale (`Jan`) substrings
- Infinite scroll: client renders 25 rows initially, appends another 25 as an `IntersectionObserver` sentinel enters the viewport

## Configuration Notes

### D1 Database ID in wrangler.toml
The `database_id` in `wrangler.toml` is committed intentionally. A D1 database ID is not a secret — it is a routing identifier, not a credential. Access to the database still requires valid Cloudflare authentication. This is consistent with how Cloudflare documents D1 configuration.

## Cost
Designed to be free for personal use:
- Cloudflare Workers: free tier (100,000 req/day)
- Cloudflare D1: free tier (5M reads/day, 100K writes/day, 5 GB)
- Cloudflare Access: free tier (up to 50 users)
