import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.resolve(root, 'dist/lambda');

fs.mkdirSync(outDir, { recursive: true });

const lambdaExternals = [
  '@sparticuz/chromium',
  'puppeteer-core',
  'puppeteer',
  'chrome-launcher',
  'lighthouse'
];

await esbuild.build({
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: lambdaExternals,
  entryPoints: [path.join(root, 'src/lambda/auditWorker.ts')],
  outfile: path.join(outDir, 'auditWorker.js'),
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);"
  }
});

console.log('Audit worker bundle written to dist/lambda/auditWorker.js');
