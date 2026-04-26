#!/usr/bin/env node

import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import process from "node:process";

const DEFAULT_PLUGIN_NAME = "sdlc-workflow";

async function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const positional = args.filter((arg) => arg !== "--check");
  const pluginName = positional[0] ?? DEFAULT_PLUGIN_NAME;

  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const pluginRoot = path.join(repoRoot, "plugins", pluginName);
  const generatedRoot = path.join(pluginRoot, ".codex-generated");
  const generatedSkillsRoot = path.join(generatedRoot, "skills");

  const claudeManifestPath = path.join(pluginRoot, ".claude-plugin", "plugin.json");
  const claudeMarketplacePath = path.join(repoRoot, ".claude-plugin", "marketplace.json");
  const codexOverridesPath = path.join(pluginRoot, ".codex-plugin.overrides.json");
  const codexManifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");
  const codexMarketplacePath = path.join(repoRoot, ".agents", "plugins", "marketplace.json");

  const claudeManifest = await readJson(claudeManifestPath);
  const claudeMarketplace = await readJson(claudeMarketplacePath);
  const overrides = await readJson(codexOverridesPath);

  const claudeMarketplaceEntry = findClaudeMarketplaceEntry(claudeMarketplace, pluginName);
  const generatedSkillFiles = await buildGeneratedSkillFiles(pluginRoot, generatedSkillsRoot);

  const codexManifest = buildCodexManifest({
    claudeManifest,
    claudeMarketplaceEntry,
    overrides,
  });
  const codexMarketplace = await buildCodexMarketplace({
    codexMarketplacePath,
    overrides,
    pluginName,
  });

  const filesToWrite = new Map();
  filesToWrite.set(codexManifestPath, serializeJson(codexManifest));
  filesToWrite.set(codexMarketplacePath, serializeJson(codexMarketplace));
  filesToWrite.set(path.join(generatedRoot, "README.md"), buildGeneratedReadme(pluginName));

  for (const file of generatedSkillFiles) {
    filesToWrite.set(file.path, file.content);
  }

  if (check) {
    await checkGeneratedFiles(filesToWrite, generatedSkillsRoot);
    console.log(`Codex plugin artifacts are up to date for ${pluginName}.`);
    return;
  }

  await fs.mkdir(path.dirname(codexManifestPath), { recursive: true });
  await fs.mkdir(path.dirname(codexMarketplacePath), { recursive: true });
  await fs.rm(generatedSkillsRoot, { recursive: true, force: true });

  for (const [targetPath, content] of filesToWrite) {
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(targetPath, content, "utf8");
  }

  console.log(`Generated Codex plugin artifacts for ${pluginName}.`);
}

function buildCodexManifest({ claudeManifest, claudeMarketplaceEntry, overrides }) {
  const manifest = {
    name: claudeManifest.name,
    version: claudeManifest.version,
    description: claudeManifest.description,
    author: {
      ...claudeManifest.author,
      ...(overrides.author ?? {}),
    },
    license: claudeManifest.license,
    keywords: claudeManifest.keywords,
    skills: overrides.codex?.generatedSkillsPath ?? "./.codex-generated/skills/",
    homepage: overrides.homepage,
    repository: overrides.repository,
    interface: {
      displayName: overrides.interface.displayName,
      shortDescription: overrides.interface.shortDescription,
      longDescription: overrides.interface.longDescription,
      developerName: overrides.interface.developerName ?? claudeManifest.author?.name,
      category: overrides.interface.category ?? normalizeCategory(claudeMarketplaceEntry.category),
      capabilities: overrides.interface.capabilities ?? ["Interactive", "Write"],
      websiteURL: overrides.interface.websiteURL ?? overrides.homepage,
      defaultPrompt: (overrides.interface.defaultPrompt ?? []).slice(0, 3),
      brandColor: overrides.interface.brandColor,
    },
  };

  if (overrides.interface.privacyPolicyURL) {
    manifest.interface.privacyPolicyURL = overrides.interface.privacyPolicyURL;
  }

  if (overrides.interface.termsOfServiceURL) {
    manifest.interface.termsOfServiceURL = overrides.interface.termsOfServiceURL;
  }

  if (overrides.codex?.includeHooks) {
    manifest.hooks = overrides.codex.hooksPath ?? "./hooks/hooks.json";
  }

  return stripUndefined(manifest);
}

async function buildCodexMarketplace({ codexMarketplacePath, overrides, pluginName }) {
  const existing = await tryReadJson(codexMarketplacePath);
  const entry = {
    name: pluginName,
    source: {
      source: "local",
      path: `./plugins/${pluginName}`,
    },
    policy: {
      installation: overrides.marketplace?.policy?.installation ?? "AVAILABLE",
      authentication: overrides.marketplace?.policy?.authentication ?? "ON_INSTALL",
    },
    category: overrides.marketplace?.category ?? "Productivity",
  };

  const marketplace = existing ?? {
    name: overrides.marketplace?.name ?? "agent-skills-marketplace",
    interface: {
      displayName: overrides.marketplace?.displayName ?? "Agent Skills Marketplace",
    },
    plugins: [],
  };

  if (!marketplace.interface) {
    marketplace.interface = {
      displayName: overrides.marketplace?.displayName ?? "Agent Skills Marketplace",
    };
  }

  if (!Array.isArray(marketplace.plugins)) {
    throw new Error(`${codexMarketplacePath} must contain a plugins array.`);
  }

  const nextPlugins = marketplace.plugins.filter((plugin) => plugin.name !== pluginName);
  nextPlugins.push(entry);
  marketplace.plugins = nextPlugins;

  return marketplace;
}

async function buildGeneratedSkillFiles(pluginRoot, generatedSkillsRoot) {
  const commandsRoot = path.join(pluginRoot, "commands");
  const commandFiles = await collectMarkdownFiles(commandsRoot);
  const commandRecords = [];
  const generatedFiles = [];

  for (const commandPath of commandFiles) {
    const relativeCommandPath = normalizeSlashes(path.relative(pluginRoot, commandPath));
    const sourceText = await fs.readFile(commandPath, "utf8");
    const { frontmatter } = splitFrontmatter(sourceText);
    const baseCommandName = normalizeCommandName(frontmatter.name, relativeCommandPath);

    commandRecords.push({
      baseCommandName,
      commandPath,
      frontmatter,
      relativeCommandPath,
    });
  }

  const nameCounts = countBy(commandRecords, (record) => record.baseCommandName);
  const usedNames = new Map();

  for (const record of commandRecords) {
    const commandName = resolveUniqueCommandName(record, nameCounts, usedNames);
    const description = sanitizeCodexDescription(
      record.frontmatter.description ??
        `Generated Codex skill wrapper for ${record.relativeCommandPath}.`,
    );
    const outputPath = path.join(generatedSkillsRoot, commandName, "SKILL.md");
    const sourceReference = normalizeSlashes(
      path.relative(path.dirname(outputPath), record.commandPath),
    );
    const skillContent = buildGeneratedSkillContent({
      commandName,
      description,
      originalCommandName: normalizeCommandName(
        record.frontmatter.name,
        record.relativeCommandPath,
      ),
      relativeCommandPath: record.relativeCommandPath,
      sourceReference,
    });

    generatedFiles.push({
      path: outputPath,
      content: skillContent,
    });
  }

  return generatedFiles;
}

function buildGeneratedReadme(pluginName) {
  return [
    "# Generated Codex Adapter Files",
    "",
    `This directory is generated by \`node scripts/generate-codex-plugin.mjs ${pluginName}\`.`,
    "",
    "- Do not hand-edit files in `.codex-generated/skills/` or `.codex-plugin/`.",
    "- Generated skills are thin Codex adapters. The canonical workflow logic remains in `commands/` and shared `skills/`.",
    "- Update the Claude source files and `.codex-plugin.overrides.json`, then regenerate.",
    "",
  ].join("\n");
}

async function checkGeneratedFiles(filesToWrite, generatedSkillsRoot) {
  const expectedPaths = new Set(filesToWrite.keys());
  const staleFiles = [];

  if (await exists(generatedSkillsRoot)) {
    const existingFiles = await collectFiles(generatedSkillsRoot);
    for (const filePath of existingFiles) {
      if (!expectedPaths.has(filePath)) {
        staleFiles.push(filePath);
      }
    }
  }

  if (staleFiles.length > 0) {
    throw new Error(
      `Generated skill directory contains stale files:\n${staleFiles.join("\n")}`,
    );
  }

  for (const [targetPath, expected] of filesToWrite) {
    const actual = await tryReadText(targetPath);
    if (actual !== expected) {
      throw new Error(`Generated file is stale: ${targetPath}`);
    }
  }
}

function buildGeneratedSkillContent({
  commandName,
  description,
  originalCommandName,
  relativeCommandPath,
  sourceReference,
}) {
  const whenToUse =
    commandName === originalCommandName
      ? `Use this skill when the user asks for \`/${originalCommandName}\`, references \`${relativeCommandPath}\`, or describes the same workflow intent.`
      : `Use this skill when the user references \`${relativeCommandPath}\` or describes this focused workflow intent. The source declares \`/${originalCommandName}\`, but this generated skill is named \`${commandName}\` to avoid colliding with another Codex skill.`;

  return [
    "---",
    `name: ${commandName}`,
    `description: ${escapeYamlScalar(description)}`,
    "---",
    "",
    `# ${commandName}`,
    "",
    "This generated skill is a Codex adapter for the canonical workflow command source. Keep the Claude command source as the single source of truth; do not copy command logic into this generated file.",
    "",
    "## When To Use",
    "",
    whenToUse,
    "",
    "## Runtime Procedure",
    "",
    "1. Read the canonical source before acting.",
    "2. Follow the canonical source as the workflow contract.",
    "3. Apply the Codex compatibility rules below before executing any step.",
    "4. If the source conflicts with current Codex runtime rules, follow the active Codex runtime rules and note the adaptation in the result.",
    "",
    "## Canonical Source",
    "",
    `- ${sourceReference}`,
    "",
    "## Codex Compatibility Rules",
    "",
    "- Do not copy Claude-only command frontmatter keys such as `disable-model-invocation`, `allowed-tools`, `argument-hint`, or `user-invocable` into generated Codex skill frontmatter. Codex skill frontmatter supports `name` and `description` here.",
    "- Use Claude `args` frontmatter as argument guidance from the canonical source, not as Codex skill metadata.",
    "- Resolve `${CLAUDE_PLUGIN_ROOT}` to the plugin root that contains this generated adapter.",
    "- Treat mentions of Claude slash commands as requests to run the equivalent generated Codex skill with the same workflow intent.",
    "- Interpret `SESSION_SLUG` as the workflow slug under `.ai/workflows/`.",
    "- Translate structured user-question tool references into concise plain-text questions in chat.",
    "- Translate Claude task-tracking API references into Codex plan/progress tracking or concise local state.",
    "- Use the current Codex model/runtime. Do not request Claude-specific model names.",
    "- Follow current Codex delegation rules. If source text requests parallel sub-agents but delegation is unavailable or not permitted, perform the review steps locally or sequentially and state that adaptation.",
    "",
    "## Path Mappings",
    "",
    "| Claude source path | Codex runtime path |",
    "|---|---|",
    "| `.claude/README.md` | `.ai/workflows/` |",
    "| `.claude/<SESSION_SLUG>/README.md` | `.ai/workflows/<slug>/00-index.md` |",
    "| `.claude/{SESSION_SLUG}/README.md` | `.ai/workflows/<slug>/00-index.md` |",
    "| `.claude/<SESSION_SLUG>/reviews/review-*.md` | `.ai/workflows/<slug>/07-review-*.md` |",
    "| `.claude/{SESSION_SLUG}/reviews/review-*.md` | `.ai/workflows/<slug>/07-review-*.md` |",
    "| `.claude/<SESSION_SLUG>/reviews/` | `.ai/workflows/<slug>/` |",
    "| `.claude/{SESSION_SLUG}/reviews/` | `.ai/workflows/<slug>/` |",
    "| `.claude/<SESSION_SLUG>/` | `.ai/workflows/<slug>/` |",
    "| `.claude/{SESSION_SLUG}/` | `.ai/workflows/<slug>/` |",
    "",
  ].join("\n");
}

function transformTextForCodex(text) {
  return text
    .replaceAll("${CLAUDE_PLUGIN_ROOT}/commands/review/", "../../../commands/review/")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}/skills/", "../../../skills/")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}/reference/", "../../../reference/")
    .replaceAll("${CLAUDE_PLUGIN_ROOT}/hooks/", "../../../hooks/")
    .replaceAll(".claude/<SESSION_SLUG>/README.md", ".ai/workflows/<slug>/00-index.md")
    .replaceAll(".claude/{SESSION_SLUG}/README.md", ".ai/workflows/<slug>/00-index.md")
    .replaceAll(".claude/<SESSION_SLUG>/reviews/review-", ".ai/workflows/<slug>/07-review-")
    .replaceAll(".claude/{SESSION_SLUG}/reviews/review-", ".ai/workflows/<slug>/07-review-")
    .replaceAll(".claude/<SESSION_SLUG>/reviews/", ".ai/workflows/<slug>/")
    .replaceAll(".claude/{SESSION_SLUG}/reviews/", ".ai/workflows/<slug>/")
    .replaceAll(".claude/<SESSION_SLUG>/", ".ai/workflows/<slug>/")
    .replaceAll(".claude/{SESSION_SLUG}/", ".ai/workflows/<slug>/")
    .replaceAll(".claude/README.md", ".ai/workflows/")
    .replaceAll("../README.md", "./00-index.md")
    .replaceAll("SESSION_SLUG", "slug");
}

function sanitizeCodexDescription(description) {
  return transformTextForCodex(description)
    .replaceAll("AskUserQuestion", "user triage")
    .replaceAll("parallel sonnet sub-agent", "review worker")
    .replaceAll("sonnet sub-agent", "review worker")
    .replaceAll("Claude Code", "Codex")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveUniqueCommandName(record, nameCounts, usedNames) {
  const duplicateCount = nameCounts.get(record.baseCommandName) ?? 0;
  let commandName = record.baseCommandName;

  if (duplicateCount > 1 && !isTopLevelCommandForName(record.relativeCommandPath, commandName)) {
    commandName = disambiguateCommandName(commandName, record.relativeCommandPath);
  }

  const firstSource = usedNames.get(commandName);
  if (firstSource) {
    throw new Error(
      `Generated Codex skill name collision for ${commandName}:\n${firstSource}\n${record.relativeCommandPath}`,
    );
  }

  usedNames.set(commandName, record.relativeCommandPath);
  return commandName;
}

function disambiguateCommandName(baseCommandName, relativeCommandPath) {
  const commandPath = relativeCommandPath
    .replace(/^commands\//, "")
    .replace(/\.md$/, "");

  if (commandPath.startsWith("review/")) {
    return `${baseCommandName}-focused`;
  }

  const directorySuffix = commandPath.split("/").slice(0, -1).join("-");
  return `${baseCommandName}-${slugify(directorySuffix || "variant")}`;
}

function isTopLevelCommandForName(relativeCommandPath, commandName) {
  return relativeCommandPath === `commands/${commandName}.md`;
}

function countBy(items, getKey) {
  const counts = new Map();

  for (const item of items) {
    const key = getKey(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
}

function normalizeCommandName(frontmatterName, relativeCommandPath) {
  if (frontmatterName) {
    return frontmatterName.replaceAll(":", "-");
  }

  const parsed = path.parse(relativeCommandPath);
  if (parsed.dir.endsWith("review")) {
    return `review-${parsed.name}`;
  }

  return parsed.name;
}

function findClaudeMarketplaceEntry(claudeMarketplace, pluginName) {
  const entry = claudeMarketplace.plugins?.find((plugin) => plugin.name === pluginName);
  if (!entry) {
    throw new Error(`Could not find ${pluginName} in ${".claude-plugin/marketplace.json"}.`);
  }

  return entry;
}

function normalizeCategory(category) {
  if (!category) {
    return "Productivity";
  }

  return category.charAt(0).toUpperCase() + category.slice(1);
}

function splitFrontmatter(sourceText) {
  const match = sourceText.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return {
      frontmatter: {},
      body: sourceText,
    };
  }

  const yamlText = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of yamlText.split(/\r?\n/)) {
    const kvMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kvMatch) {
      continue;
    }

    const [, key, rawValue] = kvMatch;
    let value = rawValue.trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    frontmatter[key] = value;
  }

  return { frontmatter, body };
}

async function collectMarkdownFiles(rootPath) {
  const files = await collectFiles(rootPath);
  return files.filter((filePath) => filePath.endsWith(".md"));
}

async function collectFiles(rootPath) {
  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(rootPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }

    files.push(fullPath);
  }

  return files.sort();
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function tryReadJson(filePath) {
  if (!(await exists(filePath))) {
    return null;
  }

  return readJson(filePath);
}

async function tryReadText(filePath) {
  if (!(await exists(filePath))) {
    return null;
  }

  return fs.readFile(filePath, "utf8");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function serializeJson(value) {
  return `${JSON.stringify(stripUndefined(value), null, 2)}\n`;
}

function stripUndefined(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => stripUndefined(item))
      .filter((item) => item !== undefined);
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, stripUndefined(item)]);
    return Object.fromEntries(entries);
  }

  return value;
}

function escapeYamlScalar(value) {
  return JSON.stringify(value);
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
