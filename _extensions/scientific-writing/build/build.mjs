import esbuild from 'esbuild';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

await esbuild.build({
  entryPoints: [resolve(__dirname, 'wink-entry.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  globalName: '_winkBundle',
  outfile: resolve(__dirname, '../wink-bundle.min.js'),
  platform: 'browser',
  define: {
    'process.env.NODE_ENV': '"production"',
    'global': 'globalThis',
  },
  logLevel: 'info',
});
