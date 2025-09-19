/*
  app.js — responsive UI + data loading + PWA hooks
  Framework-free, accessible, and mobile-first.
*/

/* -------------------------
   Helpers
------------------------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
const debounce = (fn, ms = 150) => { let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn.apply(null, args), ms); }; };

// Trap focus inside a container (for modals/drawers)
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
      last.focus(); e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first.focus(); e.preventDefault();
    }
  }
  document.addEventListener('keydown', handle);
  return () => document.removeEventListener('keydown', handle);
}

// -------- Router targets --------
const ROUTES = ['home','learn','characters','practice','quests','profile','settings'];

/* -------------------------
   State
------------------------- */
const AppState = {
  courses: [],
  filtered: [],
  installPromptEvt: null,
  prefs: {
    sfx: true, anim: true, motivate: true, listen: true,
    appearance: localStorage.getItem('theme') || 'system',
    romanized: false
  }
};

// Load prefs
function loadPrefs(){
  try{
    const saved = JSON.parse(localStorage.getItem('prefs')||'{}');
    AppState.prefs = {...AppState.prefs, ...saved};
  }catch{}
}
function savePrefs(){
  localStorage.setItem('prefs', JSON.stringify(AppState.prefs));
 localStorage.setItem('theme', AppState.prefs.appearance);
  applyTheme(AppState.prefs.appearance);
}

// Apply theme now + when toggled
function applyTheme(val){
  const root = document.documentElement;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = val === 'system' ? (prefersDark ? 'dark' : 'light') : val;
  root.setAttribute('data-theme', theme);
}

// Init Theme toggle (cycles)
function initTheme(){
  const btn = $('#themeToggle');
  loadPrefs();
  applyTheme(AppState.prefs.appearance);
  on(btn,'click',()=>{
    const order = ['light','dark','system'];
    const i = order.indexOf(AppState.prefs.appearance);
    AppState.prefs.appearance = order[(i+1)%order.length];
    savePrefs();
  });
}

// Sidebar / Drawer
function initSidebar(){
  const sidebar = $('#sidebar');
  const nav = $('.side-nav', sidebar);
  const scrim = $('#drawerScrim');
  const toggleBtn = document.querySelector('[data-action="toggle-sidebar"]');
  let untrap = null;

  // Build nav items (if not present)
  if (nav && !nav.dataset.built){
    nav.dataset.built = '1';
    const items = [
      ['learn','🏠','Learn'],
      ['characters','ම','Characters'],
      ['practice','🧩','Practice'],
      ['quests','🗺️','Quests'],
      ['profile','👤','Profile'],
      ['settings','⚙️','Settings']
    ];
    nav.innerHTML = items.map(([r,ico,txt]) =>
      `<button class="sidebar__link" data-route="${r}"><span aria-hidden="true">${ico}</span><span>${txt}</span></button>`
    ).join('');
  }

  const navButtons = $$('.sidebar__link', nav);

  navButtons.forEach(btn=>{
    on(btn,'click',()=>{
      const route = btn.dataset.route;
      location.hash = `/${route}`;
      close();
    });
    on(btn,'keydown',e=>{
      if (e.key==='Enter' || e.key===' ') { e.preventDefault(); btn.click(); }
    });
  });

  function open(){
    sidebar.classList.add('open');
    scrim.hidden = false;
    document.body.classList.add('drawer-open');
    toggleBtn && toggleBtn.setAttribute('aria-expanded','true');
    untrap = trapFocus(sidebar);
  }
  function close(){
    sidebar.classList.remove('open');
    scrim.hidden = true;
    document.body.classList.remove('drawer-open');
    toggleBtn && toggleBtn.setAttribute('aria-expanded','false');
    untrap && untrap();
  }

  on(toggleBtn,'click',()=>{
    if (sidebar.classList.contains('open')) close(); else open();
  });
  on(scrim,'click',close);

  function setActive(route){
    navButtons.forEach(b=>{
      const active = b.dataset.route===route;
      b.toggleAttribute('aria-current', active);
      b.classList.toggle('is-active', active);
    });
  }
  return { setActive };
}

// Views
const views = {
  home:   $('#view-learn'),
  learn:  $('#view-learn'),
  characters: $('#view-characters'),
  practice:   $('#view-practice'),
  quests:     $('#view-quests'),
  profile:    $('#view-profile'),
  settings:   $('#view-settings')
};

function show(route){
  Object.values(views).forEach(v=>v && (v.hidden = true));
  const el = views[route] || views.home;
  if (el) el.hidden = false;
}


// Hash router
function parseHash(){
  const h = location.hash.replace(/^#\/?/,'').toLowerCase();
  const route = ROUTES.includes(h) ? h : (h.split('?')[0]||'home');
  return route;
}
function initRouter(sidebarCtl){
  function apply(){
    const r = parseHash();
    show(r);
    sidebarCtl.setActive(r);
  }
  window.addEventListener('hashchange', apply);
  apply();
}

// Settings form
function initSettingsForm(){
  const form = $('#settingsForm');
  if (!form) return;
  // hydrate
  form.sfx.checked = !!AppState.prefs.sfx;
  form.anim.checked = !!AppState.prefs.anim;
  form.motivate.checked = !!AppState.prefs.motivate;
  form.listen.checked = !!AppState.prefs.listen;
  form.romanized.checked = !!AppState.prefs.romanized;
  [...form.appearance].forEach(r => r.checked = (r.value === AppState.prefs.appearance));

  on(form,'submit',e=>{
    e.preventDefault();
    AppState.prefs = {
      ...AppState.prefs,
      sfx: form.sfx.checked,
      anim: form.anim.checked,

      motivate: form.motivate.checked,
      listen: form.listen.checked,
      romanized: form.romanized.checked,
      appearance: form.appearance.value
    };
    savePrefs();
  });
}

// Courses (point to data/)
async function loadCourses(){
  const grid = $('#courseGrid');
  if (!grid) return;
  try{
    const res = await fetch('data/course.index.json',{cache:'no-cache'});
    const data = await res.json();
    AppState.courses = Array.isArray(data) ? data : (data.courses || []);
    AppState.filtered = [...AppState.courses];
    renderCourses(AppState.filtered, grid);
  }catch(e){
    grid.innerHTML = `<div class="card" role="alert">Couldn’t load courses (offline?).</div>`;
  }
}

// Keep existing renderCourses() + courseCard()

function appLogoPicture(alt){
  return `<picture>
    <source srcset="assets/SVG/app_logo.svg" type="image/svg+xml" />
    <img src="assets/PNG/app_logo.png" alt="${alt}" loading="lazy" decoding="async" />
  </picture>`;
}

function renderCourses(items, grid){
  grid.innerHTML = '';
  if (!items.length) {
    grid.innerHTML = '<p class="muted">No courses match your filters.</p>';
    return;
  }
  const frag = document.createDocumentFragment();
  items.forEach((c) => frag.appendChild(courseCard(c)));
  grid.appendChild(frag);
}

function courseCard(course){
  const { id, title, lang, level, progress, cover } = course;
  const card = document.createElement('article');
  card.className = 'course-card card';
  card.tabIndex = 0;
  card.setAttribute('data-id', id);
  const progressValue = Math.max(0, Math.min(100, Number(progress) || 0));
  const hasProgress = progressValue > 0;
  const primaryActionMarkup = hasProgress
    ? '<button type="button" class="btn-continue" data-action="continue">Continue</button>'
    : '<a class="btn-primary" href="#/section/1">Start Section 1</a>';
  const imgMarkup = cover
    ? `<img loading="lazy" decoding="async" src="${cover}" alt="${title || 'Course'} cover" />`
    : appLogoPicture(`${title || 'Course'} cover`);
  card.innerHTML = `
    <div class="media">
      ${imgMarkup}
    </div>
    <div class="content">
      <header class="row between">
        <h3 class="title">${title || 'Untitled'}</h3>
        <span class="badge">${lang || ''}</span>
      </header>
      <p class="muted">Level ${level ?? '—'}</p>
      <div class="progress" aria-label="Progress">
        <div class="bar" style="width:${progressValue}%"></div>
      </div>
      <footer class="row gap">
        ${primaryActionMarkup}
        <button class="btn ghost" data-action="details">Details</button>
      </footer>
    </div>
  `;

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
  location.hash = `course=${encodeURIComponent(id)}`;
}

function openCourseDetails(course) {
  const panel = $('#detailsPanel');
  const scrim = $('#detailsScrim');
  if (!panel) return;

  const titleEl = panel.querySelector('.details-title');
  if (titleEl) titleEl.textContent = course.title || 'Course';

  const langEl = panel.querySelector('.details-lang');
  if (langEl) langEl.textContent = course.lang || '';

  const levelEl = panel.querySelector('.details-level');
  if (levelEl) levelEl.textContent = String(course.level ?? '—');

  const imgWrap = panel.querySelector('.details-cover');
  if (imgWrap) {
    imgWrap.innerHTML = course.cover
      ? `<img src="${course.cover}" alt="${(course.title || 'Course')} cover" loading="lazy" decoding="async" />`
      : appLogoPicture(`${course.title || 'Course'} cover`);
  }

  panel.classList.add('open');
  if (scrim) scrim.classList.add('show');
  const untrap = trapFocus(panel);

  const close = () => {
    panel.classList.remove('open');
    if (scrim) scrim.classList.remove('show');
    untrap();
  };

  on($('#detailsClose'), 'click', close, { once: true });
  on(scrim, 'click', close, { once: true });
  on(document, 'keydown', (e) => { if (e.key === 'Escape') close(); }, { once: true });
}

// Search + filters (optional)
function initSearch() {
  const input = $('#searchInput');
  const grid = $('#courseGrid');
  if (!input || !grid) return;

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    AppState.filtered = AppState.courses.filter((c) =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.lang || '').toLowerCase().includes(q)
    );
    renderCourses(AppState.filtered, grid);
  };

  on(input, 'input', debounce(apply, 120));
}

// Install (PWA)
function initInstall() {
  const btn = $('#installBtn');
  if (btn) btn.hidden = true;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    AppState.installPromptEvt = e;
    if (btn) btn.hidden = false;
  });

  on(btn, 'click', async () => {
    const evt = AppState.installPromptEvt;
    if (!evt) return;
    evt.prompt();
    await evt.userChoice;
    if (btn) btn.hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    if (btn) btn.hidden = true;
    AppState.installPromptEvt = null;
  });
}

// Service worker
function initServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (reg.update) reg.update();
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('New content available; it will be used on next reload.');
        }
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('SW controller changed');
    });
  }).catch((err) => console.warn('SW registration failed', err));
}

// Debug helpers
function exposeForDebug() {
  window.__APP__ = { AppState, renderCourses };
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const sidebarCtl = initSidebar();
  initInstall();
  initServiceWorker();
  initSettingsForm();
  initSearch();     // optional
  loadCourses();    // populates Learn view
  initRouter(sidebarCtl);
  exposeForDebug();
});

typeof module !== 'undefined' && (module.exports = { debounce, trapFocus });

