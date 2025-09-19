(cat > design-mode.js <<'JS'
/*!
 * Designer Mode v1 — drag to place elements and export positions.json
 * Toggle: add ?design=1 to the URL or press Ctrl+Shift+D
 * Saves: localStorage (live preview), Export JSON (commit to repo)
 */
(function () {
  const STORAGE_KEY = 'layout:positions:v1';
  const ACTIVE_CLASS = 'designer--active';
  const SNAP = 1; // px; hold Alt to disable
  const SELECTOR_CANDIDATES = [
    '[data-draggable]',
    '[data-layout-key]',
    '.wp',
    '.wp-mascot',
    '.character',
    '.section-card__img'
  ];

  const state = {
    active: false,
    map: loadMap(),
    target: null,
    startX: 0,
    startY: 0,
    baseLeft: 0,
    baseTop: 0,
    toolbar: null
  };

  function loadMap() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
  }
  function saveMap() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.map, null, 2));
  }

  // Public: apply saved positions to any keyed element
  function apply(root = document) {
    const els = root.querySelectorAll('[data-layout-key]');
    els.forEach(el => {
      const key = el.getAttribute('data-layout-key');
      const pos = state.map[key];
      if (!pos) return;
      ensurePositioned(el);
      el.style.left = pos.left + 'px';
      el.style.top  = pos.top  + 'px';
    });
  }

  // Activation
  function toggle(on = !state.active) {
    state.active = on;
    document.documentElement.classList.toggle(ACTIVE_CLASS, on);
    if (on) {
      attachHandlers();
      buildToolbar();
      markDraggables();
    } else {
      detachHandlers();
      teardownToolbar();
    }
  }

  // Find/mark draggable candidates (non-destructive for normal users)
  function markDraggables() {
    const seen = new Set();
    SELECTOR_CANDIDATES.forEach(sel => {
      document.querySelectorAll(sel).forEach(el => {
        if (seen.has(el)) return;
        seen.add(el);
        el.classList.add('designer-draggable');
        el.addEventListener('click', maybeAssignKey, { capture: true });
      });
    });
  }

  function maybeAssignKey(e) {
    if (!state.active) return;
    const el = e.currentTarget;
    if (el.hasAttribute('data-layout-key')) return;
    e.preventDefault(); e.stopPropagation();
    const key = prompt('Assign a unique layout key for this element (e.g., "hero-mascot", "unit1-guide", "sec1-u2-coin3").');
    if (!key) return;
    el.setAttribute('data-layout-key', key);
    ensurePositioned(el);
    // Save current position as baseline
    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent || el.parentElement;
    const pRect = parent.getBoundingClientRect();
    const left = rect.left - pRect.left;
    const top  = rect.top  - pRect.top;
    state.map[key] = { left: Math.round(left), top: Math.round(top) };
    saveMap();
    apply(document);
  }

  // Drag logic
  function attachHandlers() {
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown, true);
  }
  function detachHandlers() {
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('keydown', onKeyDown, true);
  }

  function hit(e) {
    const path = e.composedPath ? e.composedPath() : [];
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (!node.matches) continue;
      if (node.closest('#designer-toolbar')) return null; // ignore toolbar
      if (node.matches('[data-layout-key], .designer-draggable')) return node;
    }
    return null;
  }

  function ensurePositioned(el) {
    const style = getComputedStyle(el);
    if (style.position === 'absolute') return;
    // Ensure a positioned ancestor
    const parent = el.offsetParent || el.parentElement;
    const pStyle = parent ? getComputedStyle(parent) : null;
    if (parent && pStyle && pStyle.position === 'static') {
      parent.style.position = 'relative';
    }
    el.style.position = 'absolute';
    el.style.zIndex = (parseInt(style.zIndex, 10) || 1) + 1;
  }

  function onPointerDown(e) {
    if (!state.active || e.button !== 0) return;
    const el = hit(e);
    if (!el) return;
    e.preventDefault();
    const key = el.getAttribute('data-layout-key') || el.id || '';
    if (!key) {
      // Prompt to assign on first move
      return maybeAssignKey.call(el, e);
    }
    ensurePositioned(el);
    const rect = el.getBoundingClientRect();
    const parent = el.offsetParent || el.parentElement;
    const pRect = parent.getBoundingClientRect();
    state.target = el;
    state.key = key;
    state.startX = e.clientX;
    state.startY = e.clientY;
    state.baseLeft = rect.left - pRect.left;
    state.baseTop  = rect.top  - pRect.top;
    el.setPointerCapture?.(e.pointerId);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
  }

  function onPointerMove(e) {
    if (!state.target) return;
    const dx = e.clientX - state.startX;
    const dy = e.clientY - state.startY;
    const rawLeft = state.baseLeft + dx;
    const rawTop  = state.baseTop  + dy;
    const snap = e.altKey ? 1 : SNAP;
    const left = Math.round(rawLeft / snap) * snap;
    const top  = Math.round(rawTop  / snap) * snap;
    state.target.style.left = left + 'px';
    state.target.style.top  = top  + 'px';
  }

  function onPointerUp(e) {
    if (!state.target) return;
    const left = parseInt(state.target.style.left || '0', 10) || 0;
    const top  = parseInt(state.target.style.top  || '0', 10) || 0;
    state.map[state.key] = { left, top };
    saveMap();
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
    state.target = null;
  }

  // Arrow key nudge (1px, Shift=10)
  function onKeyDown(e) {
    if (!state.active || !document.activeElement) return;
    const el = state.target || document.querySelector('[data-layout-key].designer-selected');
    if (!el) return;
    const step = e.shiftKey ? 10 : 1;
    let changed = false;
    let left = parseInt(el.style.left || '0', 10) || 0;
    let top  = parseInt(el.style.top  || '0', 10) || 0;
    if (e.key === 'ArrowLeft')  { left -= step; changed = true; }
    if (e.key === 'ArrowRight') { left += step; changed = true; }
    if (e.key === 'ArrowUp')    { top  -= step; changed = true; }
    if (e.key === 'ArrowDown')  { top  += step; changed = true; }
    if (changed) {
      e.preventDefault();
      el.style.left = left + 'px';
      el.style.top  = top  + 'px';
      const key = el.getAttribute('data-layout-key');
      if (key) { state.map[key] = { left, top }; saveMap(); }
    }
  }

  // Toolbar
  function buildToolbar() {
    if (state.toolbar) return;
    const bar = document.cr
design-mode.js
