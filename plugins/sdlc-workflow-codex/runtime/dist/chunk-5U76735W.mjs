import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  jsYaml
} from "./chunk-LFGT2BKG.mjs";

// lib/frontmatter.mjs
import { readFile } from "node:fs/promises";
var FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
function parseFrontmatter(text, { filePath = "<memory>" } = {}) {
  const match = String(text ?? "").replace(/^﻿/, "").match(FRONTMATTER_RE);
  if (!match) {
    return {
      data: {},
      content: String(text ?? ""),
      raw: "",
      excerpt: null,
      isEmpty: false,
      parseError: null
    };
  }
  try {
    const data = jsYaml.load(match[1]) ?? {};
    return {
      data,
      content: match[2] ?? "",
      raw: match[1] ?? "",
      excerpt: null,
      isEmpty: !String(match[1] ?? "").trim(),
      parseError: null
    };
  } catch (err) {
    err.message = `${filePath}: ${err.message}`;
    throw err;
  }
}
function safeParseFrontmatter(text, opts = {}) {
  try {
    return parseFrontmatter(text, opts);
  } catch (err) {
    return {
      data: null,
      content: text,
      raw: "",
      excerpt: null,
      isEmpty: false,
      parseError: err.message
    };
  }
}
async function loadFrontmatterFile(filePath) {
  const text = await readFile(filePath, "utf-8");
  return {
    path: filePath,
    text,
    ...parseFrontmatter(text, { filePath })
  };
}
async function safeLoadFrontmatterFile(filePath) {
  try {
    return await loadFrontmatterFile(filePath);
  } catch (err) {
    return {
      path: filePath,
      text: null,
      data: null,
      content: "",
      raw: "",
      excerpt: null,
      isEmpty: false,
      parseError: err.message
    };
  }
}

export {
  safeParseFrontmatter,
  safeLoadFrontmatterFile
};
