const esbuild = require('esbuild');

const watch = process.argv.includes('--watch');

const buildOptions = {
    entryPoints: ['src/extension.ts'],
    bundle: true,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: true,
    minify: false,
};

const uninstallBuildOptions = {
    entryPoints: ['src/uninstall.ts'],
    bundle: true,
    outfile: 'dist/uninstall.js',
    format: 'cjs',
    platform: 'node',
    target: 'node18',
    sourcemap: false,
    minify: false,
};

async function main() {
    if (watch) {
        const ctx = await esbuild.context(buildOptions);
        await ctx.watch();
        console.log('Watching for changes...');
    } else {
        await esbuild.build(buildOptions);
        await esbuild.build(uninstallBuildOptions);
        console.log('Build complete.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
