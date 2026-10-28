// Bundles the TypeScript renderer with esbuild.
//
// The Node-side code is compiled by `tsc` (tsconfig.json) into dist/. The
// renderer runs in the Electron renderer and is authored as ES modules that
// are bundled here into a single classic script:
//   src/UI/js/app/main.ts -> dist/UI/js/app/bundle.js
//
// Type-checking is performed separately by `tsc --noEmit` against
// tsconfig.renderer.json; esbuild only transpiles and bundles.
//
// Vendor libraries (jQuery, Bootstrap) stay as external <script> globals, so
// they are NOT imported or bundled.
const esbuild = require('esbuild');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');

/** @type {Array<{name: string, entry: string, outfile: string}>} */
const BUNDLES = [
  {
    name: 'Desktop UI',
    entry: path.join(ROOT, 'src', 'UI', 'js', 'app', 'main.ts'),
    outfile: path.join(ROOT, 'dist', 'UI', 'js', 'app', 'bundle.js'),
  },
];

// esbuild options for one bundle. Shared with scripts/dev.js, whose watch mode
// must produce exactly what a full build does.
function bundleOptions({ entry, outfile }) {
  return {
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: 'iife',
    target: 'es2022',
    platform: 'browser',
    sourcemap: true,
    legalComments: 'none',
    logLevel: 'info',
  };
}

async function buildBundle(bundle) {
  await esbuild.build(bundleOptions(bundle));
  console.log(`[build-renderer] Bundled ${bundle.name} -> ${path.relative(ROOT, bundle.outfile)}`);
}

async function main() {
  for (const bundle of BUNDLES) {
    await buildBundle(bundle);
  }
  console.log(
    `[build-renderer] Completed (${BUNDLES.length} bundle${BUNDLES.length === 1 ? '' : 's'})`
  );
}

module.exports = { BUNDLES, bundleOptions };

if (require.main === module) {
  main().catch((err) => {
    console.error('[build-renderer] Failed:', err);
    process.exit(1);
  });
}
