# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Seen** is a personal tracker for things you've seen across user-defined categories (e.g. Friends, Family, Standup Shows, Concerts — categories are created and deleted at runtime, not hardcoded). Built as a Cloudflare Workers application with a D1 (SQLite) database, static frontend assets, and Cloudflare Access for authentication.

## Repository Structure

- `frontend/` — Preact + htm frontend source
    - `script.js` — `App` component + child components managing all state and rendering
    - `utils.js` — Pure helpers (`filterItems`, `sortItems`, `hasNotes`, `formatDate`, `toCsv`, `computeSelectAllState`, `toggleAllVisible`, `buildBatchUpdates`, `categoryDeletionEffects`, `describeSelection`, `deselectId`, `storedTheme`, `readStoredTheme`, `writeStoredTheme`, `PAGE_SIZE`); shared with tests
    - `styles.css` — Minimal, neutral styling
- `public/` — Served static assets
    - `index.html` — App shell that loads the bundled script
    - `script.js`, `script.js.map`, `styles.css`, `styles.css.map` — esbuild output (gitignored, produced by `npm run build`)
- `src/` — Cloudflare Workers backend
    - `index.js` — Hono app + CRUD API for categories and items
- `migrations/` — D1 SQL migrations (applied via wrangler)
- `test/` — Tests
    - `test/worker/` — Worker API tests (use `@cloudflare/vitest-pool-workers`)
    - `test/frontend/` — Frontend unit tests (logic only, no DOM). This is a deliberate constraint: any decision worth testing gets extracted into a pure helper in `frontend/utils.js` rather than tested through rendered output. The wiring inside `App` is therefore uncovered — be correspondingly careful editing it
    - `test/worker/index.test.js` applies the repository's own migrations via `applyD1Migrations(env.DB, env.TEST_MIGRATIONS)`; the migrations are read in `vitest.config.mjs` and passed through as a binding. Do not hand-roll schema in tests — it drifts
- `build.js` — esbuild bundler for the frontend (one-shot + `--watch` mode)
- `seed.sql` — Representative seed data for local dev
- `wrangler.toml` — Cloudflare Workers configuration
- `package.json` — Dependencies and scripts

## Technology Stack

- **Backend**: Cloudflare Workers + [Hono](https://hono.dev/) router with [Zod](https://zod.dev/) validation
- **Database**: Cloudflare D1 (SQLite)
- **Frontend**: [Preact](https://preactjs.com/) + [htm](https://github.com/developit/htm) (no JSX build step required), bundled with esbuild
- **Authentication**: Cloudflare Access (zero-code, dashboard-configured)
- **Testing**: Vitest + `@cloudflare/vitest-pool-workers`
- **Build**: esbuild (frontend bundle) + Wrangler CLI (Worker deploy)

## Build & Bundling

The frontend lives in `frontend/` and is bundled to `public/` by `build.js` (esbuild handles both the JS bundle and CSS minification). All build output in `public/` except `index.html` is gitignored.

- `npm run build` — one-shot production bundle (minified)
- `npm run dev` — runs `node build.js --watch` and `wrangler dev` concurrently (sourcemaps on, no minify)
- `npm run deploy` — builds, then `wrangler deploy`
- `npm run lint` — ESLint (flat config in `eslint.config.js`)
- `npm run format` — format all files with Prettier (config in `.prettierrc.json`, ignores in `.prettierignore`)
- `npm run format:check` — verify formatting without writing (run in CI)
- `npm test` — runs Vitest once. Tests import from `frontend/utils.js` directly; they do not depend on the bundle.
- `npm run test:watch` — Vitest in watch mode

`.github/workflows/ci.yml` is a thin caller of `jluszcz/github-utils/.github/workflows/node-ci.yml@v1` — the steps live in that shared workflow, not here. It runs `build`, `test`, `lint`, and `format:check` on Node 22 for every push and PR to `main`. The resulting check is named **"Build, Test & Lint"**, which is the name branch-protection rulesets must reference. A Prettier pre-commit hook is also configured in `.pre-commit-config.yaml`.

**Before committing any change, run `npm run format:check`, `npm run lint`, `npm run build`, and `npm test` locally and confirm they all pass.** These are exactly the checks CI runs, and a commit that fails any of them should not be made.

When editing the frontend, edit files under `frontend/`. Do not edit `public/script.js` or `public/styles.css` — they are build output.

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

Two tables:

- `categories`
    - `id` — UUID primary key (generated client-side)
    - `name` — URL-safe slug derived from `label` (`[a-z0-9-]+`); also the value stored in `items.category`
    - `label` — display name
    - `sort_order` — integer ordering for tabs
- `items`
    - `id` — UUID primary key (generated client-side)
    - `category` — `categories.name` slug (foreign-key by convention, not enforced)
    - `description` — required text
    - `date` — required ISO date string (`YYYY-MM-DD`)
    - `notes` — optional text (NULL if not set)
    - `created_at`, `updated_at` — ISO timestamps

### API Routes

- `GET /api/categories` — list all categories ordered by `sort_order`
- `POST /api/categories` — create category (`{ id, label }`); `name` slug is derived server-side
- `DELETE /api/categories/:id` — delete category (409 if it still has items)
- `GET /api/items?category=X` — list all items for a category
- `POST /api/items` — create item (`{ id, category, description, date, notes }`)
- `PUT /api/items/:id` — update item fields
- `DELETE /api/items/:id` — delete item

### Frontend

- `App` (Preact functional component) owns top-level state (categories, current category, items, sort, filters, rendered count, `batchMode`, `selectedIds`, `batchDate`/`batchNotes`/`batchClearNotes`, `applyingBatch`); cell-level edit and in-flight save state lives in `EditableCell`; theme lives in the `useTheme` hook
- Notes column is hidden per-category when all `notes` values are null
- Inline editing: click a cell → input appears; Enter/blur saves; Escape cancels (cancel uses a `cancelledRef` flag so the synthetic `onBlur` becomes a no-op on Escape)
- Per-column filters in a second header row; date filter matches both ISO (`2026-01`) and locale (`Jan`) substrings
- Infinite scroll: client renders 25 rows initially, appends another 25 as an `IntersectionObserver` sentinel enters the viewport
- Batch edit mode: select rows, then set a date and/or notes on all of them with one `PUT` per row. Selections deliberately survive filtering (`toggleAllVisible`), so the panel labels how many are hidden (`describeSelection`)
- CSV export of the current category's filtered, sorted rows (`toCsv`)
- Light/dark theme toggle following `prefers-color-scheme` until the user overrides it; the override lives in `localStorage`, read through `storedTheme`/`readStoredTheme` because storage access throws outright in some browsers

**Batch state resets from a single `useEffect` keyed on `category`.** Resetting it per handler is how selections from one category once survived into another, where Apply silently updated rows the user could no longer see. Any new path that changes the category is covered automatically; do not reintroduce per-handler resets.

**Deleting a category only clears the item view when it is the current one** (`categoryDeletionEffects`). The fetch effect keys off `category`, so clearing items without changing the category blanks a table whose rows are still there.

## Configuration Notes

### `.env`

`.env` is a symlink to `~/.config/envrc/seen` and is **not** part of the repo — Wrangler and the Vitest pool load it as Worker secrets, which is why `npm test` prints "Using secrets defined in .env". Nothing in `src/`, `frontend/`, or `test/` reads a secret today; the Worker only uses its `DB` and `ASSETS` bindings. There is deliberately no `.env.example`: the one that existed documented a `D1_DATABASE_ID` variable nothing reads (`wrangler.toml` hardcodes `database_id`, see below).

### D1 Database ID in wrangler.toml

The `database_id` in `wrangler.toml` is committed intentionally. A D1 database ID is not a secret — it is a routing identifier, not a credential. Access to the database still requires valid Cloudflare authentication. This is consistent with how Cloudflare documents D1 configuration.

## Cost

Designed to be free for personal use:

- Cloudflare Workers: free tier (100,000 req/day)
- Cloudflare D1: free tier (5M reads/day, 100K writes/day, 5 GB)
- Cloudflare Access: free tier (up to 50 users)
