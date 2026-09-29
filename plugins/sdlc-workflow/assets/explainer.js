// ─────────────────────────────────────────────────────────────────────────
// explainer.js — the declarative interaction runtime for explainer fragments.
//
// Loaded by every view page (renderers/_shell.mjs) from the same origin, so it
// satisfies the view CSP `script-src 'self'`. It reads only `data-ex-*` markup;
// an explainer author never writes a <script>. No eval, no inline handlers, no
// innerHTML. Without this script every step, panel and frame stays visible
// (progressive enhancement).
//
// Markup contract (explainer v2):
//   Step-through  [data-ex-steps] > [data-ex-step] …
//                 → Previous / Next buttons and a "Step n of N" label after the
//                   container; one step shows at a time.
//   Toggle        <button data-ex-toggle="g" data-ex-show="k"> …
//                 [data-ex-panel="g"][data-ex-key="k"] …
//                 → the first button of a group is active; a press shows the
//                   panels whose key matches and hides the rest of the group.
//   Slider        <input type="range" data-ex-slider="g" min max step value>
//                 [data-ex-value="g"] (optional; data-ex-unit="ms")
//                 [data-ex-frames="g"] > [data-ex-frame="<number>"] …
//                 → shows, in each frames box, the frame nearest the value.
//
// Init is idempotent (a done element carries data-ex-ready) and runs on
// DOMContentLoaded. `window.SdlcExplainer.init(root)` re-runs it on new markup.
// ─────────────────────────────────────────────────────────────────────────

(function (root) {
  'use strict';

  /* ── Pure helpers (exported for tests) ──────────────────────────── */

  /** Clamp a step index into [0, n-1]; 0 for an empty or bad input. */
  function clampStep(i, n) {
    const count = Math.floor(Number(n));
    if (!(count > 0)) return 0;
    const k = Math.floor(Number(i));
    if (!Number.isFinite(k)) return 0;
    return Math.max(0, Math.min(count - 1, k));
  }

  /**
   * Index of the value nearest `v` in `values` (numbers or numeric strings).
   * Non-numbers are skipped; a tie goes to the earlier frame; -1 when none.
   */
  function nearestFrame(values, v) {
    const target = Number(v);
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < values.length; i++) {
      const raw = values[i];
      const x = raw === '' || raw == null ? NaN : Number(raw);
      if (!Number.isFinite(x)) continue;
      const d = Math.abs(x - target);
      if (d < bestD) { best = i; bestD = d; }
    }
    return best;
  }

  /** The value label text: "40 ms", "25%", or the bare number. */
  function valueText(v, unit) {
    const u = unit == null ? '' : String(unit).trim();
    if (!u) return String(v);
    return /^[%°′″]/.test(u) ? `${v}${u}` : `${v} ${u}`;
  }

  const api = { clampStep, nearestFrame, valueText, init };
  root.SdlcExplainer = api;
  if (typeof document === 'undefined') return;

  /* ── DOM helpers ───────────────────────────────────────────────── */

  function reducedMotion() {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch { return false; }
  }

  // Show or hide an element without losing an inline `display` the author set
  // (a snippet's <li style="display:grid"> would beat the [hidden] UA rule).
  const savedDisplay = new WeakMap();
  function setShown(el, shown, fade) {
    if (!savedDisplay.has(el)) {
      savedDisplay.set(el, [el.style.getPropertyValue('display'), el.style.getPropertyPriority('display')]);
    }
    if (shown) {
      const [v, p] = savedDisplay.get(el);
      if (v) el.style.setProperty('display', v, p);
      else el.style.removeProperty('display');
      el.removeAttribute('hidden');
      if (fade && !reducedMotion()) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 180ms ease';
        requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
      }
    } else {
      el.style.setProperty('display', 'none', 'important');
      el.setAttribute('hidden', '');
    }
  }

  function attrIs(el, name, value) {
    return el.getAttribute(name) === value;
  }

  // Theme the control only when the author gave it no class and no style.
  function styleButton(btn) {
    if (btn.getAttribute('class') || btn.getAttribute('style')) return false;
    btn.setAttribute('data-ex-styled', '');
    const s = btn.style;
    s.font = '600 13px var(--sans)';
    s.minHeight = '36px';
    s.padding = '6px 14px';
    s.borderRadius = 'var(--rad-sm)';
    s.border = '1px solid var(--rule-2)';
    s.background = 'var(--paper-2)';
    s.color = 'var(--ink)';
    s.cursor = 'pointer';
    return true;
  }

  function paintPressed(btn, on) {
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    if (!btn.hasAttribute('data-ex-styled')) return;
    btn.style.background = on ? 'var(--accent)' : 'var(--paper-2)';
    btn.style.color = on ? 'var(--on-fill)' : 'var(--ink)';
    btn.style.borderColor = on ? 'var(--accent)' : 'var(--rule-2)';
  }

  function paintDisabled(btn, off) {
    btn.setAttribute('aria-disabled', off ? 'true' : 'false');
    if (btn.hasAttribute('data-ex-styled')) {
      btn.style.opacity = off ? '0.45' : '1';
      btn.style.cursor = off ? 'default' : 'pointer';
    }
  }

  // A non-<button> control still works from the keyboard.
  function makeActivatable(el, onActivate) {
    el.addEventListener('click', onActivate);
    if (el.tagName === 'BUTTON') return;
    if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '0');
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(e); }
    });
  }

  function makeButton(text, label) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    if (label) b.setAttribute('aria-label', label);
    styleButton(b);
    return b;
  }

  /* ── Step-through ──────────────────────────────────────────────── */

  function initSteps(box) {
    if (box.hasAttribute('data-ex-ready')) return;
    box.setAttribute('data-ex-ready', '');
    const steps = Array.from(box.querySelectorAll('[data-ex-step]'))
      .filter((el) => el.closest('[data-ex-steps]') === box);
    if (steps.length < 2) return;

    const bar = document.createElement('div');
    bar.setAttribute('data-ex-controls', '');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Step controls');
    Object.assign(bar.style, {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: '10px', flexWrap: 'wrap', marginTop: '10px',
    });
    const prev = makeButton('← Previous', 'Previous step');
    const next = makeButton('Next →', 'Next step');
    const label = document.createElement('span');
    label.setAttribute('aria-live', 'polite');
    label.setAttribute('data-ex-step-label', '');
    Object.assign(label.style, { font: '12.5px var(--mono)', color: 'var(--ink-2)' });
    bar.append(prev, label, next);
    box.insertAdjacentElement('afterend', bar);

    let at = -1;
    function go(n) {
      const k = clampStep(n, steps.length);
      if (k === at) return;
      const first = at === -1;
      at = k;
      steps.forEach((s, j) => setShown(s, j === k, !first && j === k));
      label.textContent = `Step ${k + 1} of ${steps.length}`;
      paintDisabled(prev, k === 0);
      paintDisabled(next, k === steps.length - 1);
    }
    prev.addEventListener('click', () => go(at - 1));
    next.addEventListener('click', () => go(at + 1));
    bar.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
      else if (e.key === 'Home') { e.preventDefault(); go(0); }
      else if (e.key === 'End') { e.preventDefault(); go(steps.length - 1); }
    });
    go(0);
  }

  /* ── Toggle ────────────────────────────────────────────────────── */

  function initToggles(scope) {
    const doc = scope.ownerDocument || scope;
    const groups = new Map();
    for (const b of scope.querySelectorAll('[data-ex-toggle]')) {
      if (b.hasAttribute('data-ex-ready')) continue;
      const g = b.getAttribute('data-ex-toggle');
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(b);
    }
    for (const [g, buttons] of groups) {
      const panels = Array.from(doc.querySelectorAll('[data-ex-panel]')).filter((p) => attrIs(p, 'data-ex-panel', g));
      buttons.forEach((b) => {
        b.setAttribute('data-ex-ready', '');
        if (b.tagName === 'BUTTON' && !b.getAttribute('type')) b.setAttribute('type', 'button');
        styleButton(b);
      });
      const activate = (key, fade) => {
        buttons.forEach((b) => paintPressed(b, attrIs(b, 'data-ex-show', key)));
        panels.forEach((p) => setShown(p, attrIs(p, 'data-ex-key', key), fade));
      };
      buttons.forEach((b) => makeActivatable(b, () => activate(b.getAttribute('data-ex-show'), true)));
      activate(buttons[0].getAttribute('data-ex-show'), false);
    }
  }

  /* ── Slider over precomputed frames ────────────────────────────── */

  function initSlider(input) {
    if (input.hasAttribute('data-ex-ready')) return;
    input.setAttribute('data-ex-ready', '');
    const doc = input.ownerDocument;
    const g = input.getAttribute('data-ex-slider');
    const boxes = Array.from(doc.querySelectorAll('[data-ex-frames]')).filter((b) => attrIs(b, 'data-ex-frames', g));
    const sets = boxes.map((box) => {
      const frames = Array.from(box.children).filter((c) => c.hasAttribute('data-ex-frame'));
      return { frames, values: frames.map((f) => f.getAttribute('data-ex-frame')) };
    });
    const outs = Array.from(doc.querySelectorAll('[data-ex-value]')).filter((o) => attrIs(o, 'data-ex-value', g));
    outs.forEach((o) => o.setAttribute('aria-live', 'polite'));
    if (!input.getAttribute('class') && !input.getAttribute('style')) {
      input.style.accentColor = 'var(--accent)';
      input.style.width = 'min(100%, 320px)';
      input.style.minHeight = '32px';
    }
    const unit = (outs[0] && outs[0].getAttribute('data-ex-unit')) || input.getAttribute('data-ex-unit') || '';

    function update() {
      const v = input.value;
      for (const { frames, values } of sets) {
        const k = nearestFrame(values, v);
        frames.forEach((f, j) => setShown(f, j === k, false));
      }
      outs.forEach((o) => { o.textContent = valueText(v, o.getAttribute('data-ex-unit')); });
      input.setAttribute('aria-valuetext', valueText(v, unit));
    }
    input.addEventListener('input', update);
    input.addEventListener('change', update);
    update();
  }

  /* ── Init ──────────────────────────────────────────────────────── */

  function init(scope) {
    const where = scope && scope.querySelectorAll ? scope : document;
    where.querySelectorAll('[data-ex-steps]').forEach(initSteps);
    initToggles(where);
    where.querySelectorAll('input[data-ex-slider]').forEach(initSlider);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init(document), { once: true });
  } else {
    init(document);
  }
})(typeof window !== 'undefined' ? window : globalThis);
