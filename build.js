import { build, context } from 'esbuild';
import { argv } from 'node:process';

const watch = argv.includes('--watch');

const options = {
    entryPoints: ['frontend/script.js', 'frontend/styles.css'],
    bundle: true,
    format: 'esm',
    minify: !watch,
    sourcemap: watch,
    outdir: 'public',
    target: ['es2022'],
    logLevel: 'info',
};

if (watch) {
    const ctx = await context(options);
    await ctx.watch();
    console.log('esbuild watching frontend/');
} else {
    await build(options);
}
