// Builds the canvas state of one repo on a worker thread, so the design server answers every
// other request while the build reads the pages and runs git. It posts the state as JSON text.
import { parentPort, workerData } from 'node:worker_threads';
import { canvasState } from './design-state.mjs';

try {
  const state = canvasState(workerData.root, { repo: workerData.repo, writable: true, full: false });
  parentPort.postMessage({ ok: true, json: JSON.stringify(state) });
} catch (e) {
  parentPort.postMessage({ ok: false, error: e.message });
}
