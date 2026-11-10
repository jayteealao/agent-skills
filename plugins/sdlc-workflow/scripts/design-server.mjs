#!/usr/bin/env node
// The design server, in the foreground: `node scripts/design-server.mjs [--port n] [--local]`.
// With --local it listens on 127.0.0.1 only, not on the tailnet.
//
// `wf.mjs design server start` runs this script in the background, and the scheduled task of
// `wf.mjs design server install` runs it at logon. The script writes ~/.sdlc/design-server.json
// (its pid, port and addresses) and removes the file when it stops.
//
// An error that no request handler caught is written to the error log, and the server keeps
// serving: one bad request or one bad file must not take the canvas of every repo down.
import { mkdirSync, rmSync } from 'node:fs';
import { dirname } from 'node:path';
import { appendLogLine, errorsLogPath } from '../lib/home.mjs';
import { listenDesignServer, rebindTailnet, serverInfoPath, serverPort, warmStates, writeServerInfo } from '../lib/design-server.mjs';

const REBIND_MS = 30_000;

const at = process.argv.indexOf('--port');
const given = at > 0 ? Number(process.argv[at + 1]) : null;
const info = serverInfoPath();

function keepServing(kind, e) {
  const line = JSON.stringify({ at: new Date().toISOString(), label: `design-server:${kind}`, message: e?.message ?? String(e), stack: e?.stack ?? null });
  try { appendLogLine(errorsLogPath(), line); } catch { /* stderr still has it */ }
  try { process.stderr.write(`design server: ${kind}: ${e?.stack ?? e}\n`); } catch { /* no stderr */ }
}

if (given !== null && !(Number.isInteger(given) && given >= 0 && given < 65536)) {
  process.stderr.write('design server: --port needs a port number\n');
  process.exit(1);
}
const port = given ?? serverPort();

try {
  const hosts = process.argv.includes('--local') ? ['127.0.0.1'] : undefined;
  const live = await listenDesignServer({ port, hosts });
  const { servers, addresses, port: bound } = live;
  const startedAt = new Date().toISOString();
  const writeInfo = () => writeServerInfo({ pid: process.pid, port: bound, addresses, startedAt });
  mkdirSync(dirname(info), { recursive: true });
  writeInfo();
  process.on('unhandledRejection', (e) => keepServing('unhandled rejection', e));
  process.on('uncaughtException', (e) => keepServing('uncaught exception', e));
  // The tailnet can come up after the server, at logon: the server listens on it when it does.
  if (!hosts) setInterval(() => { rebindTailnet(live).then((changed) => { if (changed) writeInfo(); }).catch((e) => keepServing('rebind', e)); }, REBIND_MS).unref();
  process.stdout.write(`design server: ${addresses.join(' ')}\n`);
  // The state of each repo is built now, in the background, so the first canvas opens at once.
  warmStates().catch(() => {});
  const stop = () => {
    for (const s of servers) s.close();
    rmSync(info, { force: true });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
} catch (e) {
  process.stderr.write(`design server: ${e.code === 'EADDRINUSE' ? `the port ${port} is in use` : e.message}\n`);
  process.exit(1);
}
