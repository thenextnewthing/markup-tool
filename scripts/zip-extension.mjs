#!/usr/bin/env node
// Packages the extension (with freshly synced shared/ files) into
// public/markup-extension.zip so the website's gear menu can serve it.
import { execSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = join(root, 'public', 'markup-extension.zip');

execSync('node scripts/sync.mjs', { cwd: root, stdio: 'inherit' });
if (existsSync(zipPath)) rmSync(zipPath);
execSync(`cd "${join(root, 'extension')}" && zip -qr "${zipPath}" . -x ".*" -x "*/.*"`, { shell: '/bin/zsh' });
console.log('packaged -> public/markup-extension.zip');
