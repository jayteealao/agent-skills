import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/runtime-manifest.mjs
import { readFileSync } from "node:fs";
var HUB_NAME = "sdlc-workflow-hub";
var HUB_PROTOCOL_VERSION = 1;
var ARTIFACT_SCHEMA = "sdlc/v1";
var REGISTRY_VERSION = 2;
var HUB_CONFIG_VERSION = 1;
var RUNTIME_FAMILY = "sdlc-workflow";
var MANIFEST_URL = new URL("../runtime-manifest.json", import.meta.url);
var PACKAGE_URL = new URL("../package.json", import.meta.url);
var cached = null;
function readRuntimeManifest() {
  if (cached) return cached;
  cached = loadManifest();
  return cached;
}
function loadManifest() {
  try {
    const m = JSON.parse(readFileSync(MANIFEST_URL, "utf-8"));
    return normalizeManifest(m);
  } catch {
    return fallbackManifest();
  }
}
function normalizeManifest(m) {
  const o = m && typeof m === "object" ? m : {};
  return Object.freeze({
    family: typeof o.family === "string" && o.family ? o.family : RUNTIME_FAMILY,
    hubName: typeof o.hubName === "string" && o.hubName ? o.hubName : HUB_NAME,
    runtimeVersion: typeof o.runtimeVersion === "string" && o.runtimeVersion ? o.runtimeVersion : readPackageVersion(),
    hubProtocolVersion: Number.isInteger(o.hubProtocolVersion) ? o.hubProtocolVersion : HUB_PROTOCOL_VERSION,
    artifactSchema: typeof o.artifactSchema === "string" && o.artifactSchema ? o.artifactSchema : ARTIFACT_SCHEMA,
    registryVersion: Number.isInteger(o.registryVersion) ? o.registryVersion : REGISTRY_VERSION,
    hubConfigVersion: Number.isInteger(o.hubConfigVersion) ? o.hubConfigVersion : HUB_CONFIG_VERSION,
    buildId: typeof o.buildId === "string" && o.buildId ? o.buildId : null,
    rendererBuildId: typeof o.rendererBuildId === "string" && o.rendererBuildId ? o.rendererBuildId : null
  });
}
function fallbackManifest() {
  return Object.freeze({
    family: RUNTIME_FAMILY,
    hubName: HUB_NAME,
    runtimeVersion: readPackageVersion(),
    hubProtocolVersion: HUB_PROTOCOL_VERSION,
    artifactSchema: ARTIFACT_SCHEMA,
    registryVersion: REGISTRY_VERSION,
    hubConfigVersion: HUB_CONFIG_VERSION,
    buildId: null,
    rendererBuildId: null
  });
}
function readPackageVersion() {
  try {
    return JSON.parse(readFileSync(PACKAGE_URL, "utf-8")).version ?? "";
  } catch {
    return "";
  }
}
function runtimeIdentity() {
  const m = readRuntimeManifest();
  return {
    runtimeVersion: m.runtimeVersion,
    buildId: m.buildId,
    rendererBuildId: m.rendererBuildId,
    hubName: m.hubName,
    hubProtocolVersion: m.hubProtocolVersion
  };
}
function readRenderedIdentity(markerPath) {
  try {
    const parsed = JSON.parse(readFileSync(markerPath, "utf-8"));
    return {
      version: typeof parsed.version === "string" && parsed.version ? parsed.version : null,
      buildId: typeof parsed.buildId === "string" && parsed.buildId ? parsed.buildId : null,
      rendererBuildId: typeof parsed.rendererBuildId === "string" && parsed.rendererBuildId ? parsed.rendererBuildId : null
    };
  } catch {
    return { version: null, buildId: null, rendererBuildId: null };
  }
}
function renderIdentityMatches(recorded, active) {
  const r = recorded ?? {};
  const a = active ?? {};
  if (r.rendererBuildId && a.rendererBuildId) return r.rendererBuildId === a.rendererBuildId;
  if (r.buildId && a.buildId) return r.buildId === a.buildId;
  return Boolean(r.version) && r.version === a.runtimeVersion;
}

export {
  HUB_NAME,
  HUB_PROTOCOL_VERSION,
  readRuntimeManifest,
  runtimeIdentity,
  readRenderedIdentity,
  renderIdentityMatches
};
