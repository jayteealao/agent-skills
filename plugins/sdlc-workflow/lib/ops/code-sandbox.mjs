// The child of one code call of the wf MCP server. It runs under the permission model of Node
// with no read, write or process right (it may read this file only), so the code it runs can
// touch nothing on its own: each call of `wf` goes to the host over IPC, and the host checks it
// and does the work. A worker runs the code and blocks on a shared buffer while the host answers,
// so the library stays synchronous. Node does not block the network under the permission model:
// this file makes no claim that the code has none.
//
// The host sends `{ code, slug, names }`: `names` are the functions that the code may call
// (`records.get`, ...). The child sends `{ rpc: { slug, op, args } }` for each call and gets
// `{ value }` or `{ error }`, then sends `{ done: value }` or `{ fail: message }`.
import { Worker } from 'node:worker_threads';

const BYTES = 8 << 20;
const sab = new SharedArrayBuffer(8 + BYTES);
const flag = new Int32Array(sab, 0, 2);
const bytes = new Uint8Array(sab, 8);

// The worker: no require reaches the code, which is the body of an async function of `wf` and `open`.
const WORKER = `
const { parentPort, workerData } = require('node:worker_threads');
const flag = new Int32Array(workerData.sab, 0, 2);
const bytes = new Uint8Array(workerData.sab, 8);
const decoder = new TextDecoder();
// The code gets no door to Node: the module and process globals of the worker go first.
for (const g of ['require', 'process', 'module', 'exports', 'Buffer', '__filename', '__dirname']) { try { delete globalThis[g]; } catch {} }
const call = (slug, op, args) => {
  Atomics.store(flag, 0, 0);
  parentPort.postMessage({ rpc: { slug, op, args } });
  Atomics.wait(flag, 0, 0);
  const r = JSON.parse(decoder.decode(bytes.slice(0, flag[1])));
  if (r.error) { const e = new Error(r.error); e.name = 'WfError'; throw e; }
  return r.value;
};
const namespaces = {};
for (const name of workerData.names) {
  const [ns, fn] = name.split('.');
  (namespaces[ns] ??= new Set()).add(fn);
}
const api = (slug) => new Proxy({ slug }, {
  get(target, ns) {
    if (ns === 'slug') return slug;
    if (typeof ns !== 'string' || ns === 'then') return undefined;
    if (ns === 'help') return (name) => call(slug, 'help', [name]);
    const fns = namespaces[ns];
    if (!fns) throw new Error('wf.' + ns + ' is not a part of the library here. Its parts are: ' + Object.keys(namespaces).join(', ') + '. wf.help() lists the functions.');
    return new Proxy({}, { get(_, fn) {
      if (typeof fn !== 'string' || fn === 'then') return undefined;
      if (!fns.has(fn)) throw new Error('wf.' + ns + '.' + fn + ' is not a function here. wf.' + ns + ' has: ' + [...fns].join(', ') + '. A write is in wf_run; an effect outside the records is a typed call of wf_act.');
      return (...args) => call(slug, ns + '.' + fn, args);
    } });
  },
});
const open = (slug) => { call(null, 'open', [slug]); return api(slug); };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
(async () => {
  try {
    // The names of the CommonJS wrapper are parameters, so the code sees them as undefined. The
    // code runs in a block of its own, so it may declare one of these names (const open = ...).
    const value = await new AsyncFunction('wf', 'open', 'require', 'process', 'module', 'exports', '__filename', '__dirname', '"use strict";\\n{\\n' + workerData.code + '\\n}')(workerData.slug ? api(workerData.slug) : null, open);
    parentPort.postMessage({ done: value === undefined ? null : value });
  } catch (e) {
    parentPort.postMessage({ fail: String(e && e.message || e), op: e && e.name === 'WfError' ? 'wf' : null });
  }
})();
`;

process.once('message', ({ code, slug, names }) => {
  const w = new Worker(WORKER, { eval: true, workerData: { sab, code, slug, names }, resourceLimits: { maxOldGenerationSizeMb: 512 } });
  w.on('message', (m) => process.send(m));
  w.on('error', (e) => process.send({ fail: `the code stopped: ${e.message}` }));
  process.on('message', (m) => {
    const b = Buffer.from(JSON.stringify(m));
    if (b.length > BYTES) { const e = Buffer.from(JSON.stringify({ error: `the answer is ${b.length} bytes, above ${BYTES}: read less at once` })); bytes.set(e); flag[1] = e.length; }
    else { bytes.set(b); flag[1] = b.length; }
    Atomics.store(flag, 0, 1);
    Atomics.notify(flag, 0);
  });
});
