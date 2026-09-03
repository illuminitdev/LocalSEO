#!/usr/bin/env node
/**
 * Builds a slim Lambda package under backend/.lambda-dist (no Docker).
 * Contents: dist/, migrations/, package.json, production node_modules.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, '.lambda-dist');

function run(cmd) {
  console.log(`[prepare-lambda] ${cmd}`);
  execSync(cmd, { cwd: root, stdio: 'inherit', shell: true });
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

console.log('[prepare-lambda] Compiling TypeScript…');
run('npx tsc');

rmrf(out);
fs.mkdirSync(out, { recursive: true });

console.log('[prepare-lambda] Copying dist + migrations + package.json…');
copyDir(path.join(root, 'dist'), path.join(out, 'dist'));
copyDir(path.join(root, 'migrations'), path.join(out, 'migrations'));
fs.copyFileSync(path.join(root, 'package.json'), path.join(out, 'package.json'));
if (fs.existsSync(path.join(root, 'package-lock.json'))) {
  fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(out, 'package-lock.json'));
}

console.log('[prepare-lambda] Installing production deps into .lambda-dist…');
run(`npm ci --omit=dev --prefix "${out}"`);

console.log('[prepare-lambda] Ready:', out);
