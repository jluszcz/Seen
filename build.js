import { build, context } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import { argv } from 'node:process';

const watch = argv.includes('--watch');

const options = {
    entryPoints: ['frontend/script.js'],
    bundle: true,
    format: 'esm',
    minify: !watch,
    sourcemap: watch,
    outfile: 'public/script.js',
    target: ['es2022'],
    logLevel: 'info',
};

await mkdir('public', { recursive: true });

if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('esbuild watching frontend/');
} else {
    await build(options);
}
