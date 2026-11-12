// Builds the canvas state of each repo on a worker thread, so the design server answers every
// other request while a build reads the pages and runs git. The thread stays between the builds:
// a build keeps what it read from each file, and the next build reads only the files that changed
// (design-state.mjs, "what a build keeps"). It answers each `{ id, root, repo, files, at }` with
// the state as JSON text, under the same `id`.
import { parentPort } from 'node:worker_threads';
import { canvasState } from './design-state.mjs';

parentPort.on('message', ({ id, root, repo, files, at }) => {
  try {
    const state = canvasState(root, { repo, writable: true, full: false, reuse: true, files, at });
    parentPort.postMessage({ id, ok: true, json: JSON.stringify(state) });
  } catch (e) {
    parentPort.postMessage({ id, ok: false, error: e.message });
  }
});
