#!/usr/bin/env node
/**
 * Migrate legacy wf-design artifact frontmatter to the strict design schemas.
 *
 * Usage:
 *   node scripts/migrate-design-types.mjs [--root <project-root-or-workflows-dir>] [--dry-run]
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import yaml from 'js-yaml';
import { parseFrontmatter } from '../lib/frontmatter.mjs';

const LEGACY_CONTRACT_TYPES = new Set(['craft', 'design-brief', 'design-contract']);
const LEGACY_CRITIQUE_TYPES = new Set(['critique', 'design-critique']);
const LEGACY_AUDIT_TYPES = new Set(['audit', 'design-audit']);

function parseArgs(argv) {
  const args = { root: process.cwd(), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--root') args.root = argv[++i];
    else if (arg === '--dry-run') args.dryRun = true;
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node scripts/migrate-design-types.mjs [--root <project-root-or-workflows-dir>] [--dry-run]');
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function workflowsRoot(rootArg) {
  const root = resolve(rootArg);
  if (basename(root) === 'workflows' && basename(dirname(root)) === '.ai') return root;
  return join(root, '.ai', 'workflows');
}

function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      yield* walk(abs);
    } else if (entry.isFile() && isCandidate(entry.name)) {
      yield abs;
    }
  }
}

function isCandidate(name) {
  return name === '02c-craft.md'
    || /^02b-.*\.md$/.test(name)
    || /^07-design-.*\.md$/.test(name);
}

function ensure(data, key, value, changes) {
  if (data[key] !== undefined && data[key] !== null) return;
  data[key] = value;
  changes.push(`add ${key}`);
}

function ensureTimestamp(data, key, value, changes) {
  if (data[key] instanceof Date) {
    data[key] = data[key].toISOString();
    changes.push(`normalize ${key}`);
    return;
  }
  if (data[key] !== undefined && data[key] !== null) return;
  data[key] = normalizeTimestamp(value);
  changes.push(`add ${key}`);
}

function ensureObject(data, key, value, changes) {
  if (data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])) return;
  data[key] = value;
  changes.push(`set ${key}`);
}

function setType(data, nextType, changes) {
  if (data.type === nextType) return;
  const oldType = data.type ?? '<missing>';
  data.type = nextType;
  changes.push(`set type ${oldType} -> ${nextType}`);
}

function slugFor(filePath, data) {
  return typeof data.slug === 'string' && data.slug ? data.slug : basename(dirname(filePath));
}

function timestampFor(data, now) {
  return normalizeTimestamp(data['created-at'])
    ?? normalizeTimestamp(data['updated-at'])
    ?? now;
}

function normalizeTimestamp(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) return value;
  return null;
}

function migrateDesignContract(filePath, data, now) {
  const changes = [];
  const slug = slugFor(filePath, data);
  const createdAt = timestampFor(data, now);
  const inferredComponent = data.component ?? data.title ?? slug;

  ensure(data, 'schema', 'sdlc/v1', changes);
  setType(data, 'design-contract', changes);
  ensure(data, 'slug', slug, changes);
  ensure(data, 'component', inferredComponent, changes);
  ensure(data, 'title', `${data.component} visual contract`, changes);
  ensure(data, 'status', 'draft', changes);
  ensureTimestamp(data, 'created-at', createdAt, changes);
  ensureTimestamp(data, 'updated-at', data['created-at'] ?? now, changes);
  ensure(data, 'based-on', '02b-design.md', changes);
  ensure(data, 'tokens', [], changes);
  ensure(data, 'states', [], changes);
  ensure(data, 'sizes', [], changes);
  ensure(data, 'themes', [], changes);
  ensureObject(data, 'refs', { design: '02b-design.md' }, changes);

  return changes;
}

function zeroCritiqueSeverity() {
  return { blocker: 0, high: 0, medium: 0, low: 0, nit: 0 };
}

function zeroAuditSeverity() {
  return { blocker: 0, high: 0, medium: 0, low: 0 };
}

function migrateDesignCritique(filePath, data, now) {
  const changes = [];
  const slug = slugFor(filePath, data);
  const createdAt = timestampFor(data, now);

  ensure(data, 'schema', 'sdlc/v1', changes);
  setType(data, 'design-critique', changes);
  ensure(data, 'slug', slug, changes);
  ensure(data, 'title', 'Design critique', changes);
  ensure(data, 'status', 'draft', changes);
  ensureTimestamp(data, 'created-at', createdAt, changes);
  ensureTimestamp(data, 'updated-at', data['created-at'] ?? now, changes);
  ensure(data, 'scope', 'surface', changes);
  ensure(data, 'findings-count', 0, changes);
  ensureObject(data, 'severity-distribution', zeroCritiqueSeverity(), changes);
  ensureObject(data, 'refs', { design: '02b-design.md', contract: '02c-craft.md' }, changes);

  return changes;
}

function migrateDesignAudit(filePath, data, now) {
  const changes = [];
  const slug = slugFor(filePath, data);
  const createdAt = timestampFor(data, now);

  ensure(data, 'schema', 'sdlc/v1', changes);
  setType(data, 'design-audit', changes);
  ensure(data, 'slug', slug, changes);
  ensure(data, 'title', 'Design audit', changes);
  ensure(data, 'status', 'draft', changes);
  ensureTimestamp(data, 'created-at', createdAt, changes);
  ensureTimestamp(data, 'updated-at', data['created-at'] ?? now, changes);
  ensure(data, 'verdict', 'conditional', changes);
  ensure(data, 'audited-against', ['02b-design.md', '02c-craft.md'], changes);
  ensure(data, 'violations-count', 0, changes);
  ensureObject(data, 'severity-distribution', zeroAuditSeverity(), changes);
  ensure(data, 'remediation-state', 'none', changes);
  ensureObject(data, 'refs', { design: '02b-design.md', contract: '02c-craft.md' }, changes);

  return changes;
}

function migrationFor(filePath, data) {
  const name = basename(filePath);
  if (name === '02c-craft.md' || LEGACY_CONTRACT_TYPES.has(data.type)) return migrateDesignContract;
  if (name === '07-design-critique.md' || LEGACY_CRITIQUE_TYPES.has(data.type)) return migrateDesignCritique;
  if (name === '07-design-audit.md' || LEGACY_AUDIT_TYPES.has(data.type)) return migrateDesignAudit;
  return null;
}

function serializeMarkdown(data, content) {
  const raw = yaml.dump(data, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
    forceQuotes: true,
    quotingType: '"',
  });
  return `---\n${raw}---\n${content}`;
}

function migrateFile(filePath, { dryRun, cwd, now }) {
  const original = readFileSync(filePath, 'utf-8');
  const parsed = parseFrontmatter(original, { filePath });
  if (!parsed.raw) return null;

  const data = { ...parsed.data };
  const migrate = migrationFor(filePath, data);
  if (!migrate) return null;

  const changes = migrate(filePath, data, now);
  if (changes.length === 0) return null;

  const next = serializeMarkdown(data, parsed.content);
  const rel = relative(cwd, filePath);
  if (!dryRun) writeFileSync(filePath, next, 'utf-8');
  return { path: rel, changes };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const root = workflowsRoot(args.root);
  const now = new Date().toISOString();
  const candidates = [...walk(root)].filter((path) => statSync(path).isFile());
  let changed = 0;

  for (const path of candidates) {
    const result = migrateFile(path, { dryRun: args.dryRun, cwd, now });
    if (!result) continue;
    changed++;
    const prefix = args.dryRun ? '[dry-run]' : '[migrated]';
    console.log(`${prefix} ${result.path}: ${result.changes.join('; ')}`);
  }

  const verb = args.dryRun ? 'would migrate' : 'migrated';
  console.log(`${verb} ${changed} file(s) under ${relative(cwd, root) || root}`);
}

try {
  main();
} catch (err) {
  console.error(`[migrate-design-types] ${err.message}`);
  process.exit(1);
}
