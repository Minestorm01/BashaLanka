(function(){
  const STORAGE_KEY = 'designer:positions:v1';
  const ACTIVE_CLASS = 'designer--active';
  const SNAP = 4; // pixels, hold Alt to disable snapping
  const HANDLE_SIZE = 10;
  const SELECTOR_CANDIDATES = [
    '[data-layout-key]',
    '[data-draggable]',
    'svg',
    'img',
    'button',
    '.card',
    '.section-card__img',
    '.character',
    '.topbar',
    '.sidebar',
    '.view',
    '.card-grid > *'
  ];

  const state = {
    active: false,
    map: {},
    localMap: {},
    remoteMap: {},
    selected: null,
    toolbar: null,
    overlay: null,
    handles: [],
    interaction: null,
    listenersBound: false
  };

  init();

  function init(){
    state.localMap = loadLocalMap();
    state.map = { ...state.localMap };
    applyPositions();
    fetchRemoteMap();
    installGlobalToggle();
    if (shouldAutoActivate()) {
      toggleDesigner(true);
    }
  }

  function shouldAutoActivate(){
    const params = new URLSearchParams(location.search);
    return params.get('design') === '1';
  }

  function loadLocalMap(){
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      console.warn('[designer] failed to parse local map', err);
      return {};
    }
  }

  function saveLocalMap(){
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.map, null, 2));
    } catch (err) {
      console.warn('[designer] unable to persist layout map', err);
    }
  }

  async function fetchRemoteMap(){
    try {
      const res = await fetch('./positions.json', { cache: 'no-store' });
      if (!res.ok) return;
      const json = await res.json();
      state.remoteMap = json || {};
      state.map = { ...state.remoteMap, ...state.localMap };
      applyPositions();
    } catch (err) {
      // positions.json is optional; ignore fetch errors
      console.info('[designer] no remote positions.json detected');
    }
  }

  function installGlobalToggle(){
    document.addEventListener('keydown', onGlobalKeydown);
    window.DesignerMode = Object.freeze({
      toggle: toggleDesigner,
      apply: applyPositions,
      export: exportJSON,
      clearLocal: clearLocalData,
      getMap: () => ({ ...state.map })
    });
    if (!state.listenersBound) {
      document.addEventListener('pointerdown', handlePointerDown, true);
      window.addEventListener('resize', refreshOverlay, { passive: true });
      window.addEventListener('scroll', refreshOverlay, { passive: true });
      state.listenersBound = true;
    }
  }

  function onGlobalKeydown(event){
    if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'd') {
      event.preventDefault();
      toggleDesigner(!state.active);
    }
    if (!state.active || !state.selected) return;
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 10 : 1;
      const entry = readEntry(state.selected);
      if (!entry) return;
      if (event.key === 'ArrowUp') entry.top -= step;
      if (event.key === 'ArrowDown') entry.top += step;
      if (event.key === 'ArrowLeft') entry.left -= step;
      if (event.key === 'ArrowRight') entry.left += step;
      writeEntry(state.selected, entry);
      persistEntry(state.selected, entry);
      refreshOverlay();
    }
  }

  function toggleDesigner(force){
    const next = force === undefined ? !state.active : force;
    if (next === state.active) return;
    state.active = next;
    document.documentElement.classList.toggle(ACTIVE_CLASS, next);
    if (next) {
      markDraggables();
      buildToolbar();
      ensureOverlay();
      applyPositions();
    } else {
      teardownToolbar();
      unmarkDraggables();
      clearSelection();
    }
  }

  function markDraggables(){
    const seen = new Set();
    SELECTOR_CANDIDATES.forEach(selector => {
      document.querySelectorAll(selector).forEach(el => {
        if (!(el instanceof HTMLElement) || seen.has(el)) return;
        seen.add(el);
        el.classList.add('designer-draggable');
      });
    });
  }

  function unmarkDraggables(){
    document.querySelectorAll('.designer-draggable').forEach(el => {
      el.classList.remove('designer-draggable');
    });
  }

  function ensureOverlay(){
    if (state.overlay) return;
    const box = document.createElement('div');
    box.id = 'designer-selection';
    Object.assign(box.style, {
      position: 'fixed',
      border: '1px dashed rgba(143,176,255,0.9)',
      background: 'rgba(143,176,255,0.08)',
      zIndex: '99998',
      display: 'none',
      boxSizing: 'border-box'
    });

    const handles = ['nw','n','ne','e','se','s','sw','w'].map(name => {
      const handle = document.createElement('div');
      handle.dataset.designerHandle = name;
      Object.assign(handle.style, {
        position: 'absolute',
        width: HANDLE_SIZE + 'px',
        height: HANDLE_SIZE + 'px',
        background: '#8fb0ff',
        border: '1px solid #1d2b4b',
        borderRadius: '50%',
        pointerEvents: 'auto',
        cursor: handleCursor(name),
        transform: 'translate(-50%, -50%)'
      });
      handle.addEventListener('pointerdown', startResize, true);
      box.appendChild(handle);
      return handle;
    });

    positionHandles(handles);
    document.body.appendChild(box);
    state.overlay = box;
    state.handles = handles;
  }

  function handleCursor(name){
    switch (name) {
      case 'n': return 'ns-resize';
      case 's': return 'ns-resize';
      case 'e': return 'ew-resize';
      case 'w': return 'ew-resize';
      case 'ne': return 'nesw-resize';
      case 'sw': return 'nesw-resize';
      case 'nw': return 'nwse-resize';
      case 'se': return 'nwse-resize';
      default: return 'move';
    }
  }

  function positionHandles(handles){
    handles.forEach(handle => {
      const name = handle.dataset.designerHandle;
      switch (name) {
        case 'nw': handle.style.left = '0%'; handle.style.top = '0%'; break;
        case 'n': handle.style.left = '50%'; handle.style.top = '0%'; break;
        case 'ne': handle.style.left = '100%'; handle.style.top = '0%'; break;
        case 'e': handle.style.left = '100%'; handle.style.top = '50%'; break;
        case 'se': handle.style.left = '100%'; handle.style.top = '100%'; break;
        case 's': handle.style.left = '50%'; handle.style.top = '100%'; break;
        case 'sw': handle.style.left = '0%'; handle.style.top = '100%'; break;
        case 'w': handle.style.left = '0%'; handle.style.top = '50%'; break;
      }
    });
  }

  function buildToolbar(){
    if (state.toolbar) return;
    const bar = document.createElement('div');
    bar.id = 'designer-toolbar';

    const exportBtn = document.createElement('button');
    exportBtn.type = 'button';
    exportBtn.textContent = 'Export JSON';
    exportBtn.addEventListener('click', exportJSON);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear Local';
    clearBtn.addEventListener('click', clearLocalData);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Exit';
    closeBtn.addEventListener('click', () => toggleDesigner(false));

    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'Drag elements to move. Use handles to resize. Alt = free move.';

    bar.append(exportBtn, clearBtn, closeBtn, hint);
    document.body.appendChild(bar);
    state.toolbar = bar;
  }

  function teardownToolbar(){
    if (state.toolbar) {
      state.toolbar.remove();
      state.toolbar = null;
    }
    if (state.overlay) {
      state.overlay.style.display = 'none';
    }
  }

  function handlePointerDown(event){
    if (!state.active || event.button !== 0) return;
    if (event.target.closest('#designer-toolbar')) return;

    const handle = event.target.closest('[data-designer-handle]');
    if (handle) {
      return; // handled by startResize
    }

    if (state.overlay && event.target === state.overlay) {
      event.preventDefault();
      event.stopPropagation();
      if (state.selected) {
        startMove(event, state.selected);
      }
      return;
    }

    const element = findDraggableElement(event.target);
    if (!element) {
      clearSelection();
      return;
    }

    ensureOverlay();
    const key = ensureKey(element);
    if (!key) return;

    selectElement(element);
    event.preventDefault();
    event.stopPropagation();
    startMove(event, element);
  }

  function findDraggableElement(node){
    if (!(node instanceof Element)) return null;
    return node.closest('[data-layout-key], .designer-draggable');
  }

  function ensureKey(element){
    let key = element.getAttribute('data-layout-key');
    if (!key) {
      key = prompt('Enter a unique layout key for this element');
      if (!key) return null;
      element.setAttribute('data-layout-key', key);
    }
    return key;
  }

  function selectElement(element){
    state.selected = element;
    highlightSelection();
  }

  function clearSelection(){
    state.selected = null;
    if (state.overlay) {
      state.overlay.style.display = 'none';
    }
  }

  function highlightSelection(){
    if (!state.overlay || !state.selected) return;
    const rect = state.selected.getBoundingClientRect();
    state.overlay.style.display = 'block';
    state.overlay.style.left = rect.left + 'px';
    state.overlay.style.top = rect.top + 'px';
    state.overlay.style.width = rect.width + 'px';
    state.overlay.style.height = rect.height + 'px';
  }

  function refreshOverlay(){
    if (!state.active || !state.selected) return;
    highlightSelection();
  }

  function startMove(event, element){
    ensurePositioning(element);
    const parent = getOffsetParentRect(element);
    const rect = element.getBoundingClientRect();
    state.interaction = {
      type: 'move',
      element,
      startX: event.clientX,
      startY: event.clientY,
      baseLeft: rect.left - parent.left,
      baseTop: rect.top - parent.top,
      key: element.getAttribute('data-layout-key'),
      snap: event.altKey ? 1 : SNAP
    };
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
  }

  function startResize(event){
    if (!state.active || !state.selected) return;
    const element = state.selected;
    ensurePositioning(element);
    const parent = getOffsetParentRect(element);
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const baseWidth = parseFloat(style.width) || rect.width;
    const baseHeight = parseFloat(style.height) || rect.height;

    state.interaction = {
      type: 'resize',
      element,
      handle: event.currentTarget.dataset.designerHandle,
      startX: event.clientX,
      startY: event.clientY,
      baseLeft: rect.left - parent.left,
      baseTop: rect.top - parent.top,
      baseWidth,
      baseHeight,
      key: element.getAttribute('data-layout-key'),
      snap: event.altKey ? 1 : SNAP
    };
    event.preventDefault();
    event.stopPropagation();
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
  }

  function onPointerMove(event){
    if (!state.interaction) return;
    const i = state.interaction;
    const dx = event.clientX - i.startX;
    const dy = event.clientY - i.startY;
    const snap = event.altKey ? 1 : i.snap || SNAP;

    if (i.type === 'move') {
      const left = snapRound(i.baseLeft + dx, snap);
      const top = snapRound(i.baseTop + dy, snap);
      i.element.style.left = left + 'px';
      i.element.style.top = top + 'px';
      refreshOverlay();
    } else if (i.type === 'resize') {
      const result = computeResize(i, dx, dy, snap);
      i.element.style.left = result.left + 'px';
      i.element.style.top = result.top + 'px';
      i.element.style.width = result.width + 'px';
      i.element.style.height = result.height + 'px';
      refreshOverlay();
    }
  }

  function computeResize(interaction, dx, dy, snap){
    const minSize = 10;
    let { baseLeft: left, baseTop: top, baseWidth: width, baseHeight: height } = interaction;
    const handle = interaction.handle;

    if (handle.includes('e')) {
      width = snapRound(interaction.baseWidth + dx, snap);
    }
    if (handle.includes('s')) {
      height = snapRound(interaction.baseHeight + dy, snap);
    }
    if (handle.includes('w')) {
      const newWidth = snapRound(interaction.baseWidth - dx, snap);
      width = Math.max(minSize, newWidth);
      left = snapRound(interaction.baseLeft + dx, snap);
      if (width === minSize && newWidth < minSize) {
        left = interaction.baseLeft + interaction.baseWidth - minSize;
      }
    }
    if (handle.includes('n')) {
      const newHeight = snapRound(interaction.baseHeight - dy, snap);
      height = Math.max(minSize, newHeight);
      top = snapRound(interaction.baseTop + dy, snap);
      if (height === minSize && newHeight < minSize) {
        top = interaction.baseTop + interaction.baseHeight - minSize;
      }
    }

    width = Math.max(minSize, width);
    height = Math.max(minSize, height);

    return { left, top, width, height };
  }

  function snapRound(value, snap){
    if (!snap || snap <= 1) return Math.round(value);
    return Math.round(value / snap) * snap;
  }

  function onPointerUp(){
    if (!state.interaction) return;
    const i = state.interaction;
    const entry = readEntry(i.element) || {};
    const rect = i.element.getBoundingClientRect();
    const parent = getOffsetParentRect(i.element);
    entry.left = Math.round(rect.left - parent.left);
    entry.top = Math.round(rect.top - parent.top);
    const style = getComputedStyle(i.element);
    entry.width = Math.round(parseFloat(style.width) || rect.width);
    entry.height = Math.round(parseFloat(style.height) || rect.height);

    writeEntry(i.element, entry);
    persistEntry(i.element, entry);

    state.interaction = null;
    document.removeEventListener('pointermove', onPointerMove, true);
    document.removeEventListener('pointerup', onPointerUp, true);
  }

  function readEntry(element){
    const key = element.getAttribute('data-layout-key');
    if (!key) return null;
    const current = state.map[key];
    if (current) {
      return { ...current };
    }
    const rect = element.getBoundingClientRect();
    const parent = getOffsetParentRect(element);
    return {
      left: Math.round(rect.left - parent.left),
      top: Math.round(rect.top - parent.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height)
    };
  }

  function writeEntry(element, entry){
    ensurePositioning(element);
    if (typeof entry.left === 'number') element.style.left = entry.left + 'px';
    if (typeof entry.top === 'number') element.style.top = entry.top + 'px';
    if (typeof entry.width === 'number') element.style.width = entry.width + 'px';
    if (typeof entry.height === 'number') element.style.height = entry.height + 'px';
  }

  function persistEntry(element, entry){
    const key = element.getAttribute('data-layout-key');
    if (!key) return;
    state.map[key] = { ...entry };
    saveLocalMap();
  }

  function ensurePositioning(element){
    const computed = getComputedStyle(element);
    if (computed.position !== 'absolute' && computed.position !== 'fixed') {
      const parent = element.offsetParent || element.parentElement;
      if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
      }
      element.style.position = 'absolute';
    }
    if (!element.style.zIndex) {
      element.style.zIndex = '9990';
    }
  }

  function getOffsetParentRect(element){
    const parent = element.offsetParent || element.parentElement || document.body;
    const rect = parent.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top
    };
  }

  function applyPositions(root = document){
    if (!state.map) return;
    root.querySelectorAll('[data-layout-key]').forEach(el => {
      const key = el.getAttribute('data-layout-key');
      const entry = state.map[key];
      if (!entry) return;
      writeEntry(el, entry);
    });
    if (state.selected) {
      refreshOverlay();
    }
  }

  function exportJSON(){
    if (!Object.keys(state.map).length) {
      alert('No positions captured yet. Move or resize an element first.');
      return;
    }
    const blob = new Blob([JSON.stringify(state.map, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'positions.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function clearLocalData(){
    if (!confirm('Clear locally stored layout overrides?')) return;
    localStorage.removeItem(STORAGE_KEY);
    state.localMap = {};
    state.map = { ...state.remoteMap };
    applyPositions();
    if (state.selected) refreshOverlay();
  }
})();
