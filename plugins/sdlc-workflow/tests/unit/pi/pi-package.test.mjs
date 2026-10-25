// The pi package: the hook bridges, the answer shape, the ownership check and the manifest.
// The extensions are TypeScript that pi loads from source, so each case runs in a child
// Node process with type stripping, against a fake ExtensionAPI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ext = (name) => pathToFileURL(path.join(pluginRoot, 'pi', 'extensions', name)).href;

// Run an ES module body in a child with type stripping, and return the JSON that it prints.
function runTs(body) {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e', body], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop());
}

// A fake ExtensionAPI: handlers by event, an event bus, commands, tools and notifications.
const FAKE = `
  const handlers = {}; const bus = {}; const notes = []; const commands = [];
  const pi = {
    on: (e, h) => { (handlers[e] ||= []).push(h) },
    events: { on: (c, h) => { (bus[c] ||= []).push(h); return () => {} } },
    registerCommand: (name, c) => commands.push(name),
    getAllTools: () => globalThis.TOOLS || [],
    getCommands: () => globalThis.COMMANDS || [],
    appendEntry: () => {},
  };
  const ctx = { cwd: process.cwd(), ui: { notify: (t, k) => notes.push([k, t]) } };
  const fire = async (e, ev) => { for (const h of handlers[e] || []) await h(ev, ctx) };
`;

function tempPlugin(hooks) {
  const root = mkdtempSync(path.join(tmpdir(), 'pi-bridge-'));
  mkdirSync(path.join(root, 'hooks'));
  writeFileSync(path.join(root, 'hooks', 'hooks.json'), JSON.stringify({ hooks }));
  return root;
}

test('hookCommands keeps the entries of one event that match the tool, with the plugin root filled in', () => {
  const root = tempPlugin({
    PostToolUse: [
      { matcher: 'Write|Edit', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/a.mjs"' }] },
      { matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: 'node "${CLAUDE_PLUGIN_ROOT}/hooks/b.mjs"', timeout: 5 }] },
    ],
    SubagentStart: [{ hooks: [{ type: 'command', command: 'echo start' }] }],
  });
  const out = runTs(`
    import { hookCommands } from ${JSON.stringify(ext('bridges.ts'))};
    const r = ${JSON.stringify(root)};
    console.log(JSON.stringify({ ask: hookCommands(r, 'PostToolUse', 'AskUserQuestion'), write: hookCommands(r, 'PostToolUse', 'Write').length, start: hookCommands(r, 'SubagentStart'), none: hookCommands(r, 'Stop') }));
  `);
  assert.deepEqual(out.ask, [{ command: `node "${root}/hooks/b.mjs"`, timeoutMs: 5000 }]);
  assert.equal(out.write, 1);
  assert.deepEqual(out.start, [{ command: 'echo start', timeoutMs: 30000 }]);
  assert.deepEqual(out.none, []);
});

test('claudeAnswers gives the AskUserQuestion answers map; a cancelled questionnaire has none', () => {
  const out = runTs(`
    import { claudeAnswers } from ${JSON.stringify(ext('bridges.ts'))};
    console.log(JSON.stringify([
      claudeAnswers({ cancelled: false, answers: [
        { question: 'Which store?', kind: 'option', answer: 'Postgres' },
        { question: 'Name?', kind: 'custom', answer: 'ledger', notes: 'short' },
        { question: 'Which hosts?', kind: 'multi', answer: null, selected: ['pi', 'Codex'] },
        { question: 'Empty?', kind: 'custom', answer: null },
      ] }),
      claudeAnswers({ cancelled: true, answers: [{ question: 'x', kind: 'option', answer: 'y' }] }),
      claudeAnswers(undefined),
    ]));
  `);
  assert.deepEqual(out[0], { 'Which store?': 'Postgres', 'Name?': 'ledger (notes: short)', 'Which hosts?': 'pi, Codex' });
  assert.deepEqual(out[1], {});
  assert.deepEqual(out[2], {});
});

test('the SubagentStart bridge puts the hook context in front of the Agent prompt', () => {
  const ctxHook = path.join(mkdtempSync(path.join(tmpdir(), 'pi-hook-')), 'ctx.mjs');
  writeFileSync(ctxHook, `process.stdin.resume(); let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => { const e = JSON.parse(s); console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: 'CONTEXT for ' + e.agent_type } })) });`);
  const root = tempPlugin({ SubagentStart: [{ hooks: [{ type: 'command', command: `node "${ctxHook}"` }] }] });
  const out = runTs(`
    import { installBridges } from ${JSON.stringify(ext('bridges.ts'))};
    ${FAKE}
    installBridges(pi, ${JSON.stringify(root)});
    const agent = { toolName: 'Agent', input: { prompt: 'Find the bug.', subagent_type: 'Explore' } };
    const other = { toolName: 'bash', input: { command: 'ls' } };
    await fire('tool_call', agent); await fire('tool_call', other);
    console.log(JSON.stringify({ prompt: agent.input.prompt, other: other.input }));
  `);
  assert.equal(out.prompt, 'CONTEXT for Explore\n\nFind the bug.');
  assert.deepEqual(out.other, { command: 'ls' });
});

test('the question bridge runs the AskUserQuestion PostToolUse hooks with the answers in Claude Code shape', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pi-hook-'));
  const hook = path.join(dir, 'log.mjs');
  const log = path.join(dir, 'payload.json');
  writeFileSync(hook, `import { writeFileSync } from 'node:fs'; let s=''; process.stdin.on('data', d => s += d); process.stdin.on('end', () => writeFileSync(${JSON.stringify(log)}, s));`);
  const root = tempPlugin({ PostToolUse: [{ matcher: 'AskUserQuestion', hooks: [{ type: 'command', command: `node "${hook}"` }] }] });
  runTs(`
    import { installBridges } from ${JSON.stringify(ext('bridges.ts'))};
    ${FAKE}
    installBridges(pi, ${JSON.stringify(root)});
    await fire('tool_result', { toolName: 'ask_user_question', isError: false, input: { questions: [{ question: 'Proceed?' }] }, details: { cancelled: false, answers: [{ question: 'Proceed?', kind: 'option', answer: 'Yes' }] } });
    console.log('{}');
  `);
  const payload = JSON.parse(readFileSync(log, 'utf8'));
  assert.equal(payload.hook_event_name, 'PostToolUse');
  assert.equal(payload.tool_name, 'AskUserQuestion');
  assert.deepEqual(payload.tool_input, { questions: [{ question: 'Proceed?' }] });
  assert.deepEqual(payload.tool_response, { answers: { 'Proceed?': 'Yes' } });
});

test('the ownership check names a missing tool, a wrong owner and an excluded pi-code tool', () => {
  const out = runTs(`
    process.env.SDLC_HOST = '';
    delete process.env.SDLC_HOST;
    const { inspectOwnership } = await import(${JSON.stringify(ext('unified.ts'))});
    ${FAKE}
    const src = (p) => ({ sourceInfo: { path: p } });
    globalThis.TOOLS = [
      { name: 'web_search', ...src('node_modules/pi-web-access/dist/index.js') },
      { name: 'Agent', ...src('node_modules/pi-code/extensions/subagent/index.ts') },
      { name: 'question', ...src('node_modules/pi-code/extensions/question.ts') },
    ];
    globalThis.COMMANDS = [{ name: 'agents', ...src('node_modules/@tintinweb/pi-subagents/src/index.ts') }];
    const r = inspectOwnership(pi);
    console.log(JSON.stringify({ problems: r.problems, host: process.env.SDLC_HOST }));
  `);
  assert.ok(out.problems.includes('missing: ask_user_question (expected rpiv-ask-user-question)'));
  assert.ok(out.problems.some((p) => p.startsWith('conflict: Agent <- node_modules/pi-code')));
  assert.ok(out.problems.some((p) => p.startsWith('conflict: excluded pi-code question extension registered question')));
  assert.ok(!out.problems.some((p) => p.includes('web_search')));
  assert.equal(out.host, 'pi', 'loading the extension sets SDLC_HOST for the hook commands');
});

test('the manifest loads the package before pi-code, pins every bundled package, and carries the plugin version', () => {
  const pkg = JSON.parse(readFileSync(path.join(pluginRoot, 'pi', 'package.json'), 'utf8'));
  const plugin = JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8'));
  assert.equal(pkg.version, plugin.version);
  const ex = pkg.pi.extensions;
  assert.ok(ex.indexOf('./extensions') < ex.indexOf('./node_modules/pi-code/extensions'));
  for (const v of Object.values(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/);
  assert.deepEqual([...pkg.bundledDependencies].sort(), Object.keys(pkg.dependencies).sort());
  const r = spawnSync(process.execPath, [path.join(pluginRoot, 'pi', 'scripts', 'check.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

test('in print and JSON mode the system prompt says that no person can reply', () => {
  const root = tempPlugin({});
  const out = runTs(`
    ${FAKE}
    import { installBridges, NO_REPLY_NOTE } from ${JSON.stringify(ext('bridges.ts'))};
    installBridges(pi, ${JSON.stringify(root)});
    const [h] = handlers.before_agent_start;
    const ev = { systemPrompt: 'BASE' };
    const by = (mode) => h(ev, { ...ctx, mode });
    console.log(JSON.stringify({ print: by('print'), json: by('json'), tui: by('tui') ?? null, rpc: by('rpc') ?? null, note: NO_REPLY_NOTE }));
  `);
  assert.equal(out.print.systemPrompt, `BASE\n\n${out.note}`);
  assert.equal(out.json.systemPrompt, out.print.systemPrompt);
  assert.equal(out.tui, null);
  assert.equal(out.rpc, null);
  assert.match(out.note, /rung 3/);
});
