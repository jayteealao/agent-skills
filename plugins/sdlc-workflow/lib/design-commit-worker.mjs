// Commits the design records of one project on a worker thread, so the design server answers
// every request while the commit waits for the records lock and runs git. It posts
// `{ ok }`: true when the commit was made, when nothing changed, or when the project keeps its
// records in its own folder and needs no commit.
import { parentPort, workerData } from 'node:worker_threads';
import { commitDesignRecords, designRecordsLinked } from './design-records.mjs';

try {
  const linked = designRecordsLinked(workerData.root);
  parentPort.postMessage({ ok: !linked || commitDesignRecords(workerData.root, workerData.message) !== null });
} catch {
  parentPort.postMessage({ ok: false });
}
