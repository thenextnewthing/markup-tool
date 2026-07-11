#!/usr/bin/env node
// Copies the canonical shared/ editor files into public/shared/ (website) and
// extension/shared/ (Chrome extension). Run after any edit to shared/*:
//   npm run sync
// The copies are gitignored — shared/ is the only place to edit.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'shared');
const targets = [join(root, 'public', 'shared'), join(root, 'extension', 'shared')];

const files = readdirSync(src);
for (const dir of targets) {
  mkdirSync(dir, { recursive: true });
  for (const f of files) cpSync(join(src, f), join(dir, f));
  console.log(`synced ${files.length} files -> ${dir}`);
}
