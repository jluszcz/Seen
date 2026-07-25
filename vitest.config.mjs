import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

// Read once, on the Node side; the tests apply these to the test database so
// they run against the same schema production gets.
const migrations = await readD1Migrations('./migrations');

export default defineConfig({
    plugins: [
        cloudflareTest({
            wrangler: { configPath: './wrangler.toml' },
            miniflare: {
                d1Databases: ['DB'],
                bindings: { TEST_MIGRATIONS: migrations },
            },
        }),
    ],
    test: {
        globals: true,
        include: ['test/**/*.test.js'],
    },
});
