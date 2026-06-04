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
    registerFragmentInNav(name, detail);
    if (typeof console !== 'undefined' && console.debug) {
      console.debug('[sdlc:fragment-ready]', name, detail);
    }
  });

  /* ── SYS-R05 · fragment nav-registration ─────────────────────────────
     The #api-summary contract: a mounted fragment dispatches
     `sdlc:fragment-ready` "so the shell can register it in the navigation
     tree". We progressively populate a TOC-like nav (.frag-nav, emitted empty
     by the shell) as fragments announce themselves — dedup by name, link to the
     fragment's section anchor, and reveal the nav once it holds an entry. Stays
     hidden on pages without fragments (the production default until rich-tier
     fragments are authored). The delegated smooth-anchor handler below scrolls
     the dynamically-added links. */
  const registeredFragments = new Set();

  function registerFragmentInNav(name, detail) {
    const nav = document.querySelector('.frag-nav');
    const list = nav && nav.querySelector('.frag-nav-list');
    if (!list) return;
    const key = String(name);
    if (registeredFragments.has(key)) return;
    registeredFragments.add(key);

    // Locate the fragment's root section to anchor the link. Prefer an explicit
    // marker; fall back to the conventional `section.fragment-<name>` or the
    // artifact id.
    const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : s);
    const section =
      document.querySelector(`[data-fragment="${esc(key)}"]`) ||
      document.querySelector(`section.fragment-${esc(key)}`) ||
      (detail.artifact ? document.getElementById(String(detail.artifact)) : null);
    let href = '';
    if (section) {
      if (!section.id) section.id = `fragment-${slugifyName(key)}`;
      href = `#${section.id}`;
    }

    const li = document.createElement('li');
    const a = document.createElement('a');
    a.className = 'frag-nav-link';
    if (href) a.setAttribute('href', href);
    a.textContent = humanizeName(key);
    const badge = fragmentBadge(detail);
    if (badge) {
      const b = document.createElement('span');
      b.className = 'frag-nav-badge';
      b.textContent = badge;
      a.appendChild(b);
    }
    li.appendChild(a);
    list.appendChild(li);
    nav.classList.add('is-active');
  }

  function slugifyName(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'fragment';
  }
  function humanizeName(s) {
    const t = String(s).replace(/[-_]+/g, ' ').trim();
    return t ? t.charAt(0).toUpperCase() + t.slice(1) : 'Fragment';
  }
  // A small count badge from whatever the fragment reported (findings first,
  // then a revision marker), or nothing.
  function fragmentBadge(detail) {
    if (detail && detail.findings != null && detail.findings !== '') {
      const n = Number(detail.findings);
      return Number.isFinite(n) ? `${n} finding${n === 1 ? '' : 's'}` : String(detail.findings);
    }
    if (detail && detail.rev != null && detail.rev !== '') return `rev ${detail.rev}`;
    return '';
  }

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
