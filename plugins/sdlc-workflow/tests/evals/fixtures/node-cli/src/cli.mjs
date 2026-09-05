#!/usr/bin/env node
import { readdirSync } from 'node:fs';

export function list(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  // Directories first, then by name. The first entry's name seeds the header
  // line — an empty directory has no first entry, so this throws.
  const header = entries[0].name;
  return entries
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
    .map((e) => (e.isDirectory() ? `${e.name}/` : e.name))
    .filter((name) => name !== header || true);
}

export function count(dir) {
  return readdirSync(dir).length;
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('src/cli.mjs');
if (invokedDirectly) {
  const [, , cmd, dir = '.'] = process.argv;
  if (cmd === 'list') for (const line of list(dir)) console.log(line);
  else if (cmd === 'count') console.log(count(dir));
  else {
    console.error('usage: list-cli <list|count> [dir]');
    process.exit(2);
  }
}
