// renderers/_yaml.mjs
// Parse YAML frontmatter from a markdown file. Optionally merge with a sibling
// .yaml file when present. Sibling-yaml wins on key conflict (documented in
// SUNFLOWER-VIEW-PLAN §"Pipeline" and §"Decisions").

import { readFileSync, existsSync } from 'node:fs';
import yaml from 'js-yaml';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/**
 * Split a markdown file into { frontmatter (parsed), body }. Returns
 * { frontmatter: null, body: wholeFile } when no frontmatter block is present
 * — the renderer surfaces a warn-banner page rather than crashing.
 */
export function splitFrontmatter(text) {
  const m = text.match(FRONTMATTER_RE);
  if (!m) return { frontmatter: null, body: text };
  let frontmatter;
  try {
    frontmatter = yaml.load(m[1]) ?? {};
  } catch (err) {
    return { frontmatter: null, body: text, parseError: err.message };
  }
  return { frontmatter, body: m[2] };
}

/**
 * Read sibling YAML file when it exists. Returns null on missing or invalid.
 */
export function readSiblingYaml(absPath) {
  if (!existsSync(absPath)) return null;
  const text = readFileSync(absPath, 'utf-8');
  try {
    return yaml.load(text) ?? null;
  } catch {
    return null;
  }
}

/**
 * Merge MD-frontmatter and sibling-YAML. Sibling YAML wins on key conflict.
 * Deep-merges objects; arrays are replaced wholesale.
 */
export function mergeFrontmatter(md, sibling) {
  if (!sibling) return md ?? {};
  if (!md)      return sibling;
  const out = { ...md };
  for (const [k, v] of Object.entries(sibling)) {
    if (
      v && typeof v === 'object' && !Array.isArray(v) &&
      out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])
    ) {
      out[k] = mergeFrontmatter(out[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/**
 * One-shot loader. Given the MD absolute path and the sibling YAML absolute
 * path (which may not exist), returns { frontmatter, body, siblingYaml }.
 */
export function loadArtifact(mdAbs, yamlAbs) {
  const text = readFileSync(mdAbs, 'utf-8');
  const { frontmatter: mdFm, body, parseError } = splitFrontmatter(text);
  const siblingYaml = yamlAbs ? readSiblingYaml(yamlAbs) : null;
  return {
    frontmatter: mergeFrontmatter(mdFm, siblingYaml),
    body,
    siblingYaml,
    parseError: parseError ?? null,
  };
}
