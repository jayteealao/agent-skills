// ─────────────────────────────────────────────────────────────────────────
// sdlc.js — shell behaviour + fragment-ready subscription
// Reference: SUNFLOWER-VIEW-PLAN §"JS interactions"
// No framework, no build step. Hand-rolled vanilla.
// ─────────────────────────────────────────────────────────────────────────

(function () {
  'use strict';

  /* ── Fragment-ready event subscription ───────────────────────────── */

  window.addEventListener('sdlc:fragment-ready', (e) => {
    const detail = e.detail ?? {};
    const name = detail.name ?? 'unknown';
    document.body.dataset.fragmentReady = name;
    document.body.dataset.fragmentArtifact = detail.artifact ?? '';
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[sdlc:fragment-ready]', name, detail);
    }
  });

  /* ── DOM-ready behaviours ────────────────────────────────────────── */

  function ready(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn);
    } else { fn(); }
  }

  ready(() => {
    wireCopyButtons();
    wireSmoothAnchors();
    wireTokenCopy();
  });

  /* ── Copy-to-clipboard via .copy-btn[data-copy-target] ───────────── */

  function wireCopyButtons() {
    document.querySelectorAll('.copy-btn[data-copy-target]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const sel = btn.getAttribute('data-copy-target');
        const val = btn.getAttribute('data-copy-value');
        let text = val;
        if (!text && sel) {
          const target = document.querySelector(sel);
          text = target ? (target.innerText ?? target.textContent ?? '') : '';
        }
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          flashCopied(btn);
        } catch (err) {
          console.warn('[sdlc] clipboard write failed', err);
        }
      });
    });
  }

  /* ── Token-copy (design fragment uses data-token-copy on swatches) ── */

  function wireTokenCopy() {
    document.querySelectorAll('[data-token-copy]').forEach((el) => {
      el.style.cursor = 'pointer';
      el.addEventListener('click', async () => {
        const text = el.getAttribute('data-token-copy');
        if (!text) return;
        try {
          await navigator.clipboard.writeText(text);
          flashCopied(el);
        } catch { /* ignore */ }
      });
    });
  }

  function flashCopied(el) {
    el.classList.add('is-copied');
    const prev = el.getAttribute('aria-label');
    el.setAttribute('aria-label', 'copied');
    setTimeout(() => {
      el.classList.remove('is-copied');
      if (prev) el.setAttribute('aria-label', prev);
    }, 900);
  }

  /* ── Smooth-scroll for hash anchors (skip RCA :target paths) ─────── */

  function wireSmoothAnchors() {
    document.body.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href === '#') return;
      // RCA timeline anchors use :target — let them navigate normally
      if (a.closest('.fragment-rca')) return;
      const target = document.querySelector(href);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.replaceState(null, '', href);
    });
  }
})();
