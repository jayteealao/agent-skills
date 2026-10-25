#!/usr/bin/env node
// The design server, in the foreground: `node scripts/design-server.mjs [--port n] [--local]`.
// With --local it listens on 127.0.0.1 only, not on the tailnet.
//
// `wf.mjs design server start` runs this script in the background, and the scheduled task of
// `wf.mjs design server install` runs it at logon. The script writes ~/.sdlc/design-server.json
// (its pid, port and addresses) and removes the file when it stops.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { listenDesignServer, serverInfoPath, serverPort } from '../lib/design-server.mjs';

const at = process.argv.indexOf('--port');
const port = at > 0 ? Number(process.argv[at + 1]) : serverPort();
const info = serverInfoPath();

try {
  const hosts = process.argv.includes('--local') ? ['127.0.0.1'] : undefined;
  const { servers, addresses, port: bound } = await listenDesignServer({ port, hosts });
  mkdirSync(dirname(info), { recursive: true });
  writeFileSync(info, `${JSON.stringify({ pid: process.pid, port: bound, addresses, startedAt: new Date().toISOString() }, null, 2)}\n`);
  process.stdout.write(`design server: ${addresses.join(' ')}\n`);
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
