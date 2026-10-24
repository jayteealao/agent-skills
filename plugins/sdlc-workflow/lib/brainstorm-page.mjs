// lib/brainstorm-page.mjs — the brainstorm page (WF-DESIGN-PLAN A7, intake/brainstorm.md 2.9).
//
// `brainstorm-page.html` presents a brainstorm board to the person as one page, built
// from the two files: `brainstorm-board.json` (the agent's board) and `01-brainstorm.md`
// (the person's document). It is in plain words and shows no key: keys are only the
// anchors of the page, so a link such as `brainstorm-page.html#<key>` still works.
// The page never replaces the two files. scripts/brainstorm-page.mjs writes it.
//
// The page reuses `esc`, `safeHref` and the contact-sheet style of lib/design-boards.mjs.

import { SHEET_CSS, esc, safeHref } from './design-boards.mjs';

export const PAGE_FILE = 'brainstorm-page.html';

const PAGE_CSS = `
main{max-width:980px}
section p,section li{max-width:72ch}
ul.items{margin:0;padding-left:20px}ul.items li{margin:0 0 8px}
.tag{display:inline-block;margin-left:6px;padding:0 6px;border:1px solid var(--rule);border-radius:4px;font-size:12px;color:var(--mute)}
.why,.note{color:var(--mute)}
h3{font-size:15px;margin:16px 0 6px}
.story{margin:0 0 12px}.story b{display:block;font-size:13px;color:var(--mute)}
.stale{border-left:3px solid #c19c00;padding-left:8px}
`;

const byKey = (list = []) => new Map((list ?? []).filter((e) => e?.key).map((e) => [e.key, e]));
const isLive = (i) => i && !i['replaced-by'] && i.scope !== 'cut';
const IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
// The forms that get a packet file (lib/packets.mjs PACKET_FORMS); a copy keeps the page free of the schema validator.
const PACKET_FORMS = new Set(['intake', 'investigate', 'discover', 'rca', 'fix', 'hotfix', 'task', 'extension']);

/**
 * The `##` sections of a markdown document, as heading → text. HTML comments are
 * dropped; the frontmatter is skipped.
 */
export function documentSections(text) {
  const body = String(text ?? '').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n?/, '').replace(/<!--[\s\S]*?-->/g, '');
  const out = new Map();
  let head = null;
  let lines = [];
  const flush = () => { if (head !== null) out.set(head, lines.join('\n').trim()); };
  for (const line of body.split('\n')) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !line.startsWith('###')) { flush(); head = m[1]; lines = []; } else if (head !== null) lines.push(line);
  }
  flush();
  return out;
}

/** Plain inline markdown: `code` and **bold**, after escaping. */
function inline(text) {
  return esc(text).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
}

/** A small markdown block: paragraphs, `-` lists and `###` headings. */
function blockHtml(text) {
  const out = [];
  let list = [];
  let para = [];
  const flushPara = () => { if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`); para = []; };
  const flushList = () => { if (list.length) out.push(`<ul class="items">${list.map((l) => `<li>${inline(l)}</li>`).join('')}</ul>`); list = []; };
  for (const line of String(text ?? '').split('\n')) {
    const t = line.trim();
    if (!t) { flushPara(); flushList(); continue; }
    const h = /^###\s+(.+)$/.exec(t);
    if (h) { flushPara(); flushList(); out.push(`<h3>${inline(h[1])}</h3>`); continue; }
    const li = /^[-*]\s+(.+)$/.exec(t);
    if (li) { flushPara(); list.push(li[1]); continue; }
    flushList();
    para.push(t);
  }
  flushPara();
  flushList();
  return out.join('\n');
}

const section = (title, inner, id = null) => `<section${id ? ` id="${esc(id)}"` : ''}><h2>${esc(title)}</h2>${inner}</section>`;
const list = (rows) => (rows.length ? `<ul class="items">${rows.join('')}</ul>` : '<p class="note">None.</p>');
const tag = (text) => `<span class="tag">${esc(text)}</span>`;

/**
 * A sketch path as a link from the board folder. A path under this board's folder
 * becomes relative; another `.ai/` path cannot be linked from the page and is null.
 */
function sketchHref(board, path) {
  if (!path) return null;
  const p = String(path).split('\\').join('/');
  const own = `.ai/workflows/${board.slug}/`;
  if (p.startsWith(own)) return p.slice(own.length);
  if (p.startsWith('.ai/')) return null;
  return p.replace(/^\.\//, '');
}

/** The areas of the board in order, with an extra group for threads that name no area. */
function areaGroups(board) {
  const areas = [...(board.areas ?? [])];
  const threads = byKey(board.threads);
  const areaOf = (item) => threads.get(item.thread)?.area ?? null;
  const known = new Set(areas.map((a) => a.key));
  return { areas, areaOf, known };
}

function decisionLine(item, replaced) {
  const tags = [
    item.core ? tag('core') : '',
    item.scope === 'later' ? tag('left for later') : '',
    item.scope === 'pending-cut' ? tag('cut waits for you') : '',
  ].join('');
  const parts = [`${esc(item.text)}${tags}`];
  if (item.why) parts.push(`<span class="why">Why: ${esc(item.why)}</span>`);
  if (item['accepted-risk']) parts.push(`<span class="why">Accepted risk: ${esc(item['accepted-risk'])}</span>`);
  for (const old of replaced) parts.push(`<span class="why">This replaced: ${esc(old.text)}</span>`);
  return `<li id="${esc(item.key)}">${parts.join('<br>')}</li>`;
}

function sketchFigure(board, s) {
  const href = sketchHref(board, s.path);
  const file = href ? href.split('#')[0] : null;
  const link = s.canvas?.link ?? s.link ?? null;
  const pic = file && IMAGE_RE.test(file)
    ? `<a href="${safeHref(href)}"><img src="${safeHref(file)}" alt="${esc(s.caption ?? '')}" loading="lazy"></a>`
    : `<div class="none">${href ? `Open <a href="${safeHref(href)}">${esc(href)}</a>.` : s.path ? `The file is <code>${esc(s.path)}</code>.` : 'No file.'}</div>`;
  const meta = [s.state ? esc(s.state) : null, link ? `<a href="${safeHref(link)}">canvas</a>` : null].filter(Boolean).join(' · ');
  return `<figure id="${esc(s.key)}">${pic}<figcaption><b>${esc(s.caption ?? '')}</b><span>${meta}</span></figcaption></figure>`;
}

/**
 * The HTML of the brainstorm page.
 * @param {object} board - brainstorm-board.json
 * @param {string} doc - the text of 01-brainstorm.md ('' when it is missing)
 * @param {{generatedAt?:string}} [opts]
 */
export function renderBrainstormPage(board, doc = '', { generatedAt = '' } = {}) {
  const b = board ?? {};
  const sections = documentSections(doc);
  const items = b.items ?? [];
  const replacedBy = new Map();
  for (const i of items) if (i['replaced-by']) replacedBy.set(i['replaced-by'], [...(replacedBy.get(i['replaced-by']) ?? []), i]);
  const out = [];

  // The summary: the story section of the document.
  const summary = sections.get('The Brainstorm');
  out.push(section('Where we are', summary ? blockHtml(summary) : '<p class="note">No summary yet.</p>', 'summary'));

  // The session stories, newest first.
  const stories = [...(b.stories ?? [])].sort((x, y) => (y.session ?? 0) - (x.session ?? 0));
  const sessionsDoc = sections.get('Sessions');
  out.push(section('Sessions', stories.length
    ? stories.map((s) => `<div class="story" id="session-${esc(s.session)}"><b>Session ${esc(s.session)}</b>${esc(s.text)}</div>`).join('')
    : sessionsDoc ? blockHtml(sessionsDoc) : '<p class="note">No session story yet.</p>', 'sessions'));

  // The areas, with their briefs and scope.
  const { areas, areaOf, known } = areaGroups(b);
  out.push(section('Areas', list(areas.map((a) => {
    const meta = [a.side ? `${a.side} side` : null, a.state, a.scope ? `scope: ${a.scope}` : null].filter(Boolean).join(' · ');
    return `<li id="${esc(a.key)}"><b>${esc(a.name)}</b>${meta ? ` <span class="why">${esc(meta)}</span>` : ''}${a.brief ? `<br>${esc(a.brief)}` : ''}</li>`;
  })), 'areas'));

  // The decisions by area, core first.
  const decisions = items.filter((i) => i.kind === 'decision' && isLive(i));
  const groups = [...areas.map((a) => ({ name: a.name, key: a.key })), { name: 'Other', key: null }];
  const decisionHtml = groups.map((g) => {
    const mine = decisions.filter((i) => (g.key ? areaOf(i) === g.key : !known.has(areaOf(i))));
    if (!mine.length) return '';
    mine.sort((x, y) => Number(Boolean(y.core)) - Number(Boolean(x.core)));
    return `<h3>${esc(g.name)}</h3><ul class="items">${mine.map((i) => decisionLine(i, replacedBy.get(i.key) ?? [])).join('')}</ul>`;
  }).join('');
  out.push(section('Decisions', decisionHtml || '<p class="note">None yet.</p>', 'decisions'));

  // The open ideas and the open questions.
  const ideas = items.filter((i) => i.kind === 'idea' && isLive(i));
  const questions = items.filter((i) => i.kind === 'question' && (i.state === 'open' || i.state === 'for-plan'));
  out.push(section('Ideas still open', list([
    ...ideas.map((i) => `<li id="${esc(i.key)}">${esc(i.text)}${i.source ? ` <span class="why">(${i.source === 'person' ? 'yours' : 'the agent'})</span>` : ''}</li>`),
    ...questions.map((i) => `<li id="${esc(i.key)}">${esc(i.text)}${tag(i.state === 'for-plan' ? 'for the plan' : 'open question')}</li>`),
  ]), 'ideas'));

  // The findings with their sources.
  const findings = items.filter((i) => i.kind === 'finding' && !i['replaced-by']);
  out.push(section('What we found', list(findings.map((i) => {
    const src = i.evidence ? `<br><span class="why">Source: ${/^https?:\/\//i.test(i.evidence) ? `<a href="${safeHref(i.evidence)}">${esc(i.evidence)}</a>` : `<code>${esc(i.evidence)}</code>`}</span>` : '';
    return `<li id="${esc(i.key)}">${esc(i.text)}${i.check && i.check !== 'verified' ? tag(i.check) : ''}${src}</li>`;
  })), 'findings'));

  // The open tensions and the accepted risks, the top risks first.
  const tensions = items.filter((i) => i.kind === 'tension' && i.state === 'open' && !i['replaced-by']);
  const risks = decisions.filter((i) => i['accepted-risk']).sort((x, y) => Number(Boolean(y['top-risk'])) - Number(Boolean(x['top-risk'])));
  out.push(section('Open tensions and accepted risks', list([
    ...tensions.map((i) => `<li id="${esc(i.key)}">${esc(i.text)}${tag('open tension')}</li>`),
    ...risks.map((i) => `<li>${esc(i['accepted-risk'])}${i['top-risk'] ? tag('top risk') : ''}<br><span class="why">With: ${esc(i.text)}</span></li>`),
  ]), 'risks'));

  // The sketches (A7): caption, file, canvas link, and state.
  const sketches = (b.sketches ?? []).filter((s) => s?.key);
  if (sketches.length || b.focus === 'design') {
    out.push(section('Sketches', sketches.length ? `<div class="grid">${sketches.map((s) => sketchFigure(b, s)).join('')}</div>` : '<p class="note">No sketch yet.</p>', 'sketches'));
  }

  // The work packets, in order, with the stale ones marked.
  const packets = [...(b.work ?? [])].sort((x, y) => (x.order ?? 1e9) - (y.order ?? 1e9) || String(x.key).localeCompare(String(y.key)));
  out.push(section('Work packets', list(packets.map((p) => {
    const packet = PACKET_FORMS.has(p.shape) ? `work/${p.slug ?? p.key}.md` : null;
    const files = (p['written-files'] ?? []).map((f) => `<code>${esc(f.path)}</code>`).join(', ');
    const meta = [p.order ? `${p.order}.` : null, p.shape === 'write-now' ? 'written in the session' : p.shape, p.state].filter(Boolean).join(' · ');
    const stale = p.stale ? `${tag('stale')}${p['stale-because'] ? `<br><span class="why">Stale because ${esc(p['stale-because'])}</span>` : ''}` : '';
    const title = packet ? `<a href="${safeHref(packet)}">${esc(p.title)}</a>` : esc(p.title);
    return `<li id="${esc(p.key)}"${p.stale ? ' class="stale"' : ''}><b>${title}</b> <span class="why">${esc(meta)}</span>${stale}${files ? `<br><span class="why">Files: ${files}</span>` : ''}${p['why-here'] ? `<br><span class="why">After the packet before it, because ${esc(String(p['why-here']).replace(/\.$/, ''))}.</span>` : ''}</li>`;
  })), 'work'));

  const title = b.topic ?? b.slug ?? 'Brainstorm';
  const meta = [
    b.sessions ? `${b.sessions} session${b.sessions === 1 ? '' : 's'}` : null,
    b.focus === 'design' ? 'design focus' : null,
    b['updated-at'] ? `updated ${b['updated-at']}` : null,
    generatedAt ? `written ${generatedAt}` : null,
  ].filter(Boolean).map(esc).join(' · ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brainstorm · ${esc(title)}</title>
<style>
${SHEET_CSS}${PAGE_CSS.trimStart()}</style></head><body>
<header><h1>Brainstorm · ${esc(title)}</h1><p>${meta}</p><p>This page presents the board. The board and the document hold the truth: <a href="brainstorm-board.json">brainstorm-board.json</a>, <a href="01-brainstorm.md">01-brainstorm.md</a>.</p></header>
<main>
${out.join('\n')}
</main>
</body></html>
`;
}
