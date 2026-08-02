#!/usr/bin/env node
// Packages the extension (with freshly synced shared/ files) into
// public/markup-extension.zip so the website's gear menu can serve it.
import { ZipArchive } from 'archiver';
import { createWriteStream, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = join(root, 'public', 'markup-extension.zip');
const extensionPath = join(root, 'extension');

const sync = spawnSync(process.execPath, ['scripts/sync.mjs'], { cwd: root, stdio: 'inherit' });
if (sync.status !== 0) process.exit(sync.status ?? 1);
if (existsSync(zipPath)) rmSync(zipPath);

await new Promise((resolve, reject) => {
  const output = createWriteStream(zipPath);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  output.on('close', resolve);
  output.on('error', reject);
  archive.on('error', reject);
  archive.pipe(output);
  archive.glob('**/*', { cwd: extensionPath, dot: false });
  archive.finalize();
});

console.log('packaged -> public/markup-extension.zip');
