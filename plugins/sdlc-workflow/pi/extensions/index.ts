import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import bridges from "./bridges.ts";
import unified from "./unified.ts";

// The package entry. pi loads this file before pi-code (see package.json), so the
// handlers change a tool input before pi-code's hook filters read it.
export default function sdlcWorkflow(pi: ExtensionAPI) {
  unified(pi);
  bridges(pi);
}
