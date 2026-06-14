#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import "./chunk-SGA7NFMW.mjs";

// scripts/verify-runtime.mjs
import { existsSync as existsSync2, readFileSync as readFileSync2 } from "node:fs";
import { dirname, join as join2, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// lib/runtime-buildid.mjs
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
var RUNTIME_BUILD_DIRS = ["dist", "assets", "components", "schemas"];
function computeBuildId(root, dirs = RUNTIME_BUILD_DIRS) {
  const hash = createHash("sha256");
  const files = [];
  for (const d of dirs) {
    const abs = join(root, d);
    if (existsSync(abs)) collectFiles(root, abs, files);
  }
  files.sort((a, b) => a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0);
  for (const f of files) {
    hash.update(f.rel, "utf-8");
    hash.update("\0");
    hash.update(readFileSync(f.abs));
    hash.update("\0");
  }
  return hash.digest("hex");
}
function collectFiles(root, dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(root, abs, out);
    else if (entry.isFile()) out.push({ abs, rel: relative(root, abs).split(sep).join("/") });
  }
}

// scripts/verify-runtime.mjs
var REQUIRED = [
  "dist",
  "assets",
  "components",
  "schemas",
  join2("docs", "site"),
  "runtime-manifest.json",
  join2("tests", "frontmatter.schema.json")
];
function verifyRuntime(runtimeRoot) {
  const problems = [];
  for (const r of REQUIRED) {
    if (!existsSync2(join2(runtimeRoot, r))) problems.push(`missing required payload entry: ${r}`);
  }
  let manifest = null;
  try {
    manifest = JSON.parse(readFileSync2(join2(runtimeRoot, "runtime-manifest.json"), "utf-8"));
  } catch {
    problems.push("runtime-manifest.json missing or unparseable");
  }
  let computed = null;
  if (manifest) {
    if (!manifest.buildId) {
      problems.push("runtime-manifest.json carries no buildId (unbuilt source tree?)");
    } else {
      computed = computeBuildId(runtimeRoot, RUNTIME_BUILD_DIRS);
      if (computed !== manifest.buildId) {
        problems.push(
          `buildId mismatch: payload reproduces ${short(computed)} but manifest claims ${short(manifest.buildId)}`
        );
      }
    }
  }
  return {
    ok: problems.length === 0,
    runtimeRoot,
    runtimeVersion: manifest?.runtimeVersion ?? null,
    declaredBuildId: manifest?.buildId ?? null,
    computedBuildId: computed,
    problems
  };
}
function short(h) {
  return typeof h === "string" ? `${h.slice(0, 12)}\u2026` : String(h);
}
function selfDefaultRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}
function parseArgs(argv) {
  const opts = { root: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--root") opts.root = argv[++i];
    else if (a.startsWith("--root=")) opts.root = a.slice("--root=".length);
    else if (a === "--json") opts.json = true;
  }
  return opts;
}
function runCli() {
  const opts = parseArgs(process.argv.slice(2));
  const root = opts.root ? resolve(opts.root) : selfDefaultRoot();
  const result = verifyRuntime(root);
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
  } else if (result.ok) {
    process.stdout.write(
      `[verify-runtime] OK  runtimeVersion=${result.runtimeVersion} buildId=${short(result.declaredBuildId)}
[verify-runtime] ${root}
`
    );
  } else {
    process.stderr.write(`[verify-runtime] FAIL  ${root}
`);
    for (const p of result.problems) process.stderr.write(`  - ${p}
`);
  }
  process.exit(result.ok ? 0 : 1);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
export {
  verifyRuntime
};
