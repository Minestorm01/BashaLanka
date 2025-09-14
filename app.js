/*
  app.js — responsive UI + data loading + PWA hooks
  This file is framework‑free, fully accessible, and mobile‑first.
  It auto‑initializes, but every feature checks for element existence so
  it’s safe across pages.
*/

// -------------------------
// Helpers
// -------------------------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
const debounce = (fn, ms = 150) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), ms);
  };
};

// Small utility: trap focus in a container (for modals/drawers)
function trapFocus(container) {
  if (!container) return () => {};
  const sel = 'a, button, input, textarea, select, [tabindex]:not([tabindex="-1"])';
  const focusables = () => $$(sel, container).filter(el => !el.disabled && el.offsetParent !== null);
  function handle(e) {
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (!f.length) return;
    const first = f[0];
    const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
  document.addEventListener('keydown', handle);
  return () => document.removeEventListener('keydown', handle);
}

// -------------------------
// State
// -------------------------
const AppState = {
  courses: [],
  filtered: [],
  layout: localStorage.getItem('layoutMode') || 'auto', // 'auto' | 'mobile' | 'desktop'
  theme: localStorage.getItem('theme') || 'system', // 'system' | 'dark' | 'light'
  installPromptEvt: null,
};

// -------------------------
// Init
// -------------------------
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initLayoutControls();
  initNavDrawer();
  initSearch();
  initInstall();
  initServiceWorker();
  loadCourses();
  exposeForDebug();
});

// -------------------------
// Theme handling (optional)
// -------------------------
function initTheme() {
  const btn = $('#themeToggle');
  const root = document.documentElement;

  const apply = (val) => {
    AppState.theme = val;
    localStorage.setItem('theme', val);
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = val === 'system' ? (prefersDark ? 'dark' : 'light') : val;
    root.setAttribute('data-theme', theme);
  };

  // apply at start
  apply(AppState.theme);

  on(btn, 'click', () => {
    const next = AppState.theme === 'light' ? 'dark' : AppState.theme === 'dark' ? 'system' : 'light';
    apply(next);
  });
}

// -------------------------
// Layout handling (desktop/mobile/auto)
// -------------------------
function initLayoutControls() {
  const select = $('#layoutMode'); // <select id="layoutMode"> auto | desktop | mobile
  const root = document.documentElement;

  const apply = (mode) => {
    AppState.layout = mode;
    localStorage.setItem('layoutMode', mode);
    root.setAttribute('data-layout', mode);
    // In CSS you can target [data-layout="mobile"] or [data-layout="desktop"].
    // When mode === 'auto', layout is purely responsive via media queries.
  };

  if (select) {
    select.value = AppState.layout;
    on(select, 'change', (e) => apply(e.target.value));
  }

  apply(AppState.layout);
}

// -------------------------
// Drawer / Nav (mobile first)
// -------------------------
function initNavDrawer() {
  const openBtn = $('#menuButton');
  const closeBtn = $('#drawerClose');
  const drawer = $('#drawer');
  const scrim = $('#drawerScrim');
  let untrap = () => {};

  const open = () => {
    if (!drawer) return;
    drawer.classList.add('open');
    scrim && scrim.classList.add('show');
    drawer.setAttribute('aria-hidden', 'false');
    untrap = trapFocus(drawer);
    const firstButton = $('button, a, [tabindex]:not([tabindex="-1"])', drawer);
    firstButton && firstButton.focus();
  };

  const close = () => {
    if (!drawer) return;
    drawer.classList.remove('open');
    scrim && scrim.classList.remove('show');
    drawer.setAttribute('aria-hidden', 'true');
    untrap();
    openBtn && openBtn.focus();
  };

  on(openBtn, 'click', open);
  on(closeBtn, 'click', close);
  on(scrim, 'click', close);
  on(document, 'keydown', (e) => e.key === 'Escape' && drawer?.classList.contains('open') && close());
}

// -------------------------
// Course loading + rendering
// -------------------------
async function loadCourses() {
  const grid = $('#courseGrid');
  if (!grid) return; // page has no grid

  try {
    const res = await fetch('course.index.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('Failed to fetch course.index.json');
    const data = await res.json();
    // Expect an array of { id, title, lang, level, progress, cover }
    AppState.courses = Array.isArray(data) ? data : (data.courses || []);
    AppState.filtered = [...AppState.courses];
    renderCourses(AppState.filtered, grid);
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="card error" role="alert">Couldn\'t load courses. You\'re likely offline or the JSON is missing.</div>`;
  }
}

function renderCourses(items, grid) {
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<p class="muted">No courses match your filters.</p>';
    return;
  }

  const frag = document.createDocumentFragment();
  items.forEach((c) => frag.appendChild(courseCard(c)));
  grid.appendChild(frag);
}

function courseCard(course) {
  const { id, title, lang, level, progress, cover } = course;
  const card = document.createElement('article');
  card.className = 'course-card card';
  card.tabIndex = 0;
  card.setAttribute('data-id', id);

  card.innerHTML = `
    <div class="media">
      <img loading="lazy" src="${cover || 'icon-192.png'}" alt="${title} cover"/>
    </div>
    <div class="content">
      <header class="row between">
        <h3 class="title">${title || 'Untitled'}</h3>
        <span class="badge">${lang || ''}</span>
      </header>
      <p class="muted">Level ${level ?? '—'}</p>
      <div class="progress">
        <div class="bar" style="width:${Math.max(0, Math.min(100, Number(progress) || 0))}%"></div>
      </div>
      <footer class="row gap">
        <button class="btn primary" data-action="continue">Continue</button>
        <button class="btn ghost" data-action="details">Details</button>
      </footer>
    </div>
  `;

  // Actions
  on(card, 'click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'continue') {
      navigateToCourse(id);
    } else if (action === 'details') {
      openCourseDetails(course);
    }
  });

  return card;
}

function navigateToCourse(id) {
  // Swap with a real router or navigation later
  console.log('Navigate to course', id);
  const url = new URL(window.location.href);
  url.searchParams.set('course', id);
  window.location.href = url.toString();
}

function openCourseDetails(course) {
  const panel = $('#detailsPanel');
  const scrim = $('#detailsScrim');
  if (!panel) return;

  panel.querySelector('.details-title')!.textContent = course.title || 'Course';
  panel.querySelector('.details-lang')!.textContent = course.lang || '';
  panel.querySelector('.details-level')!.textContent = String(course.level ?? '—');
  const img = panel.querySelector('img.details-cover');
  if (img) img.src = course.cover || 'icon-512.png';

  panel.classList.add('open');
  scrim && scrim.classList.add('show');
  const untrap = trapFocus(panel);

  const close = () => {
    panel.classList.remove('open');
    scrim && scrim.classList.remove('show');
    untrap();
  };

  on($('#detailsClose'), 'click', close, { once: true });
  on(scrim, 'click', close, { once: true });
  on(document, 'keydown', (e) => e.key === 'Escape' && close(), { once: true });
}

// -------------------------
// Search + filters
// -------------------------
function initSearch() {
  const input = $('#searchInput');
  const grid = $('#courseGrid');
  if (!input || !grid) return;

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    AppState.filtered = AppState.courses.filter((c) => {
      return (
        (c.title || '').toLowerCase().includes(q) ||
        (c.lang || '').toLowerCase().includes(q)
      );
    });
    renderCourses(AppState.filtered, grid);
  };

  on(input, 'input', debounce(apply, 120));
}

// -------------------------
// Install (PWA)
// -------------------------
function initInstall() {
  const btn = $('#installBtn');
  if (btn) btn.style.display = 'none';

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.installPromptEvt = e;
    if (btn) btn.style.display = '';
  });

  on(btn, 'click', async () => {
    const evt = AppState.installPromptEvt;
    if (!evt) return;
    evt.prompt();
    const { outcome } = await evt.userChoice;
    console.log('PWA install outcome:', outcome);
    if (btn) btn.style.display = 'none';
  });
}

// -------------------------
// Service worker
// -------------------------
function initServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('SW registered', reg.scope);
      })
      .catch((err) => console.warn('SW registration failed', err));
  }
}

// -------------------------
// Resize observer (optional)
// -------------------------
(function initResizeDebug() {
  const badge = $('#breakpointBadge');
  if (!badge) return;
  const update = () => {
    const w = window.innerWidth;
    let label = 'auto';
    if (document.documentElement.getAttribute('data-layout') === 'mobile') label = 'mobile (forced)';
    else if (document.documentElement.getAttribute('data-layout') === 'desktop') label = 'desktop (forced)';
    else label = w < 640 ? 'sm' : w < 768 ? 'md' : w < 1024 ? 'lg' : 'xl+';
    badge.textContent = label + ' • ' + w + 'px';
  };
  update();
  window.addEventListener('resize', debounce(update, 100));
})();

// -------------------------
// Debug helpers
// -------------------------
function exposeForDebug() {
  // So you can play in devtools easily
  window.__APP__ = { AppState, renderCourses };
}

typeof module !== 'undefined' && (module.exports = { debounce, trapFocus });

