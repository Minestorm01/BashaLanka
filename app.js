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

const escapeHTML = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const USER_STORAGE_KEY = 'bashalanka-user';

function createUser(username = '') {
  const trimmed = String(username || '').trim();
  return {
    username: trimmed,
    isAdmin: trimmed.toLowerCase() === 'admin'
  };
}

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    if (!raw) return createUser('');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.username === 'string') {
      return createUser(parsed.username);
    }
  } catch (err) {
    console.warn('Failed to load stored user', err);
  }
  return createUser('');
}

function persistUser(user) {
  if (user && user.username) {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify({ username: user.username }));
  } else {
    localStorage.removeItem(USER_STORAGE_KEY);
  }
}

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
  installPromptEvt: null,
  user: loadStoredUser(),
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

/* -------------------------
   Profile & Debug tools
------------------------- */

function profileStatsMarkup(){
  return `
    <div class="card profile-card profile-stats">
      <h2 class="card__title">Your stats</h2>
      <ul class="stats">
        <li><strong id="stat-streak">0</strong> day streak</li>
        <li><strong id="stat-xp">0</strong> XP total</li>
        <li><strong id="stat-crown">0</strong> crowns</li>
      </ul>
    </div>`;
}

const DebugTools = (() => {
  const controls = [];
  let controlsContainer = null;
  let sectionSelect = null;
  let hostEl = null;
  let exerciseTesterCleanup = null;

  const DEFAULT_INLINE_CONFIG = JSON.stringify(
    {
      prompt: 'මම',
      transliteration: 'mama',
      instructions: 'Pick the correct translation.',
      choices: [
        { label: 'I', isCorrect: true },
        { label: 'You', isCorrect: false },
        { label: 'Fine', isCorrect: false },
      ],
    },
    null,
    2,
  );

  function isTranslateToBaseConfig(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    if (!candidate.prompt || !String(candidate.prompt).trim().length) return false;
    if (!Array.isArray(candidate.choices) || candidate.choices.length === 0) return false;
    return true;
  }

  function normaliseTranslateToBaseChoices(choices) {
    if (!Array.isArray(choices)) return [];
    return choices
      .map((choice) => {
        if (choice === null || choice === undefined) {
          return null;
        }

        if (typeof choice === 'string' || typeof choice === 'number') {
          return { label: String(choice), isCorrect: false };
        }

        if (typeof choice !== 'object') {
          return null;
        }

        const next = { ...choice };

        if (next.label === undefined && next.value !== undefined) {
          next.label = String(next.value);
        }

        if (next.label === undefined || String(next.label).trim().length === 0) {
          return null;
        }

        if (next.isCorrect === undefined && next.correct !== undefined) {
          next.isCorrect = Boolean(next.correct);
        }

        return {
          ...next,
          label: String(next.label),
          isCorrect: Boolean(next.isCorrect),
        };
      })
      .filter((choice) => choice && choice.label);
  }

  function normaliseTranslateToBaseConfig(config) {
    if (!isTranslateToBaseConfig(config)) {
      return null;
    }

    const { choices = [], ...rest } = config;
    const normalisedChoices = normaliseTranslateToBaseChoices(choices);
    if (!normalisedChoices.length) {
      return null;
    }

    return {
      ...rest,
      choices: normalisedChoices,
    };
  }

  function appendControl(entry){
    if(!controlsContainer) return;
    const row = document.createElement('div');
    row.className = 'debug-control';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost debug-control__btn';
    btn.textContent = entry.label;
    btn.addEventListener('click', () => {
      if(!sectionSelect || sectionSelect.disabled) return;
      const sectionId = sectionSelect.value;
      if(sectionId) entry.callback(sectionId);
    });
    row.appendChild(btn);
    controlsContainer.appendChild(row);
  }

  function setControlsDisabled(disabled){
    if(!controlsContainer) return;
    controlsContainer.querySelectorAll('button').forEach(btn => {
      btn.disabled = !!disabled;
    });
  }

  function populateSections(){
    if(!sectionSelect) return;
    const learn = window.__LEARN__;
    if(!learn || typeof learn.ensureSections !== 'function'){ setControlsDisabled(true); return; }
    learn.ensureSections().then(() => {
      const snapshot = typeof learn.getSectionsSnapshot === 'function' ? learn.getSectionsSnapshot() : [];
      const options = snapshot.map(sec => `<option value="${sec.number}">Section ${sec.number}: ${escapeHTML(sec.title || 'Untitled')}</option>`);
      if(options.length){
        sectionSelect.innerHTML = options.join('');
        sectionSelect.disabled = false;
        setControlsDisabled(false);
      }else{
        sectionSelect.innerHTML = '<option value="" disabled selected>No sections</option>';
        sectionSelect.disabled = true;
        setControlsDisabled(true);
      }
    }).catch(() => {
      sectionSelect.innerHTML = '<option value="" disabled selected>Unavailable</option>';
      sectionSelect.disabled = true;
      setControlsDisabled(true);
    });
  }

  function registerDebugControl(label, callback){
    const entry = { label, callback };
    controls.push(entry);
    if(controlsContainer) appendControl(entry);
    return entry;
  }

  function setupExerciseTester(container) {
    if (!container) return null;

    container.innerHTML = `
      <section class="debug-tester" aria-labelledby="debug-exercise-tester-title">
        <div class="debug-tester__header">
          <h3 id="debug-exercise-tester-title">Test exercises</h3>
          <p class="help">Preview exercises with lesson JSON or inline config without leaving the app.</p>
        </div>
        <div class="debug-tester__controls">
          <div class="field">
            <label class="label" for="debugExerciseType">Exercise type</label>
            <select id="debugExerciseType" class="select">
              <option value="TranslateToBase">TranslateToBase</option>
            </select>
          </div>
          <div class="field">
            <label class="label" for="debugLessonPath">Lesson data path</label>
            <input id="debugLessonPath" class="input" type="text" placeholder="./assets/Lessions/.../lesson-01.md" autocomplete="off" />
            <p class="help">Enter a site-relative path such as <code>./assets/Lessions/.../lesson-01.md</code>. Markdown lessons can be passed directly without copying configs.</p>
          </div>
          <label class="debug-tester__inline-toggle" for="debugInlineToggle">
            <input id="debugInlineToggle" type="checkbox" />
            Use inline config
          </label>
          <div class="debug-tester__inline-config" data-inline-config hidden>
            <label class="label" for="debugInlineConfig">Inline config (JSON)</label>
            <textarea id="debugInlineConfig" class="textarea" rows="10" spellcheck="false"></textarea>
            <p class="help">Paste an exercise config to test it instantly.</p>
          </div>
          <div>
            <button type="button" class="btn btn--primary" id="debugRunExerciseTest">Run test</button>
          </div>
        </div>
        <div class="debug-tester__preview" id="debugExercisePreview" role="region" aria-live="polite" aria-label="Exercise preview"></div>
      </section>`;

    const typeSelect = container.querySelector('#debugExerciseType');
    const lessonPathInput = container.querySelector('#debugLessonPath');
    const inlineToggle = container.querySelector('#debugInlineToggle');
    const inlineConfigWrap = container.querySelector('[data-inline-config]');
    const inlineConfigInput = container.querySelector('#debugInlineConfig');
    const runButton = container.querySelector('#debugRunExerciseTest');
    const preview = container.querySelector('#debugExercisePreview');

    const EXERCISE_MODULE_LOADERS = {
      TranslateToBase: () => import('./exercises/TranslateToBase/index.js'),
    };

    const exerciseModulePromises = {};

    if (inlineConfigInput) {
      inlineConfigInput.value = DEFAULT_INLINE_CONFIG;
    }

    function syncInlineVisibility() {
      if (!inlineToggle || !inlineConfigWrap || !lessonPathInput) return;
      const useInline = inlineToggle.checked;
      inlineConfigWrap.hidden = !useInline;
      lessonPathInput.disabled = useInline;
    }

    function normaliseConfigForType(type, config) {
      if (!config) return null;
      switch (type) {
        case 'TranslateToBase':
          return normaliseTranslateToBaseConfig(config);
        default:
          return config;
      }
    }

    async function resolveConfig(type) {
      if (inlineToggle?.checked) {
        const raw = inlineConfigInput?.value?.trim();
        if (!raw) {
          throw new Error('Provide inline JSON to test the exercise.');
        }
        try {
          const parsed = JSON.parse(raw);
          const normalised = normaliseConfigForType(type, parsed);
          if (!normalised) {
            throw new Error('Inline config is missing required fields for the selected exercise.');
          }
          return normalised;
        } catch (error) {
          throw new Error('Inline config must be valid JSON.');
        }
      }

      const lessonPath = lessonPathInput?.value?.trim();
      if (!lessonPath) {
        throw new Error('Enter a lesson data path or enable inline config.');
      }

      return lessonPath;
    }

    async function runTest() {
      if (!preview) return;
      const type = typeSelect?.value || '';
      preview.innerHTML = '<p>Loading exercise…</p>';

      let loader = window?.BashaLanka?.exercises?.[type];

      if (!loader) {
        const moduleLoader = EXERCISE_MODULE_LOADERS[type];
        if (moduleLoader) {
          if (!exerciseModulePromises[type]) {
            exerciseModulePromises[type] = moduleLoader().catch((error) => {
              console.error(`Failed to load ${type} exercise module.`, error);
              throw error;
            });
          }

          try {
            await exerciseModulePromises[type];
          } catch (error) {
            preview.innerHTML = `<p class="debug-tester__error">Could not load the ${escapeHTML(type)} exercise module.</p>`;
            exerciseModulePromises[type] = null;
            return;
          }

          loader = window?.BashaLanka?.exercises?.[type];
        }
      }

      if (typeof loader !== 'function') {
        preview.innerHTML = `<p class="debug-tester__error">Exercise loader for "${escapeHTML(type)}" is unavailable.</p>`;
        return;
      }

      try {
        if (runButton) runButton.disabled = true;
        const config = await resolveConfig(type);
        const preparedConfig =
          typeof config === 'string' && config.toLowerCase().endsWith('.md')
            ? { lessonPath: config }
            : config;
        await loader({ target: preview, config: preparedConfig });
      } catch (error) {
        console.error('Exercise test failed:', error);
        preview.innerHTML = `<p class="debug-tester__error">${escapeHTML(error.message || 'Exercise test failed.')}</p>`;
      } finally {
        if (runButton) runButton.disabled = false;
      }
    }

    inlineToggle?.addEventListener('change', syncInlineVisibility);
    runButton?.addEventListener('click', runTest);
    syncInlineVisibility();

    return () => {
      inlineToggle?.removeEventListener('change', syncInlineVisibility);
      runButton?.removeEventListener('click', runTest);
    };
  }

  function mount(root){
    if(!root) return;
    hostEl = root;
    root.innerHTML = `
      <section class="debug-panel" aria-labelledby="debug-tools-title">
        <div class="debug-panel__header">
          <h2 id="debug-tools-title">Debug Tools</h2>
        </div>
        <div class="debug-panel__picker">
          <label for="debugSectionSelect">Target section</label>
          <select id="debugSectionSelect" class="select"></select>
        </div>
        <div class="debug-panel__controls"></div>
        <div class="debug-panel__tester" data-debug-tester></div>
      </section>`;
    controlsContainer = root.querySelector('.debug-panel__controls');
    sectionSelect = root.querySelector('#debugSectionSelect');
    populateSections();
    controls.forEach(appendControl);
    const testerHost = root.querySelector('[data-debug-tester]');
    exerciseTesterCleanup = setupExerciseTester(testerHost);
  }

  function unmount(){
    if(hostEl){
      hostEl.innerHTML = '';
    }
    if (typeof exerciseTesterCleanup === 'function') {
      exerciseTesterCleanup();
    }
    controlsContainer = null;
    sectionSelect = null;
    hostEl = null;
    exerciseTesterCleanup = null;
  }

  window.addEventListener('learn:sections-loaded', () => {
    populateSections();
  });

  return {
    registerDebugControl,
    mount,
    unmount,
    refresh: populateSections
  };
})();

function withSection(sectionId, handler){
  if(!sectionId) return;
  const learn = window.__LEARN__;
  if(!learn || typeof learn.ensureSections !== 'function'){
    console.warn('Learn module not ready yet.');
    return;
  }
  learn.ensureSections().then(() => {
    const snapshot = typeof learn.getSectionsSnapshot === 'function' ? learn.getSectionsSnapshot() : [];
    const section = snapshot.find(sec => String(sec.number) === String(sectionId));
    if(section){
      handler(section, learn);
    }
  });
}

DebugTools.registerDebugControl('Set Section to Not Started', sectionId => {
  withSection(sectionId, (_section, learn) => {
    learn.setSectionState?.(sectionId, { progress: 0, lessonsDone: 0, status: 'unlocked' });
  });
});

DebugTools.registerDebugControl('Set Section to Half Complete', sectionId => {
  withSection(sectionId, (section, learn) => {
    const total = Number(section.lessonsTotal) || 0;
    const lessonsDone = total ? Math.max(1, Math.round(total / 2)) : 0;
    learn.setSectionState?.(sectionId, { lessonsDone, status: 'unlocked' });
  });
});

DebugTools.registerDebugControl('Set Section to Complete', sectionId => {
  withSection(sectionId, (section, learn) => {
    const total = Number(section.lessonsTotal) || 0;
    learn.setSectionState?.(sectionId, { progress: 1, lessonsDone: total, status: 'completed' });
  });
});

function renderProfileView(){
  const wrap = $('#profileContent');
  if(!wrap) return;
  DebugTools.unmount();
  const { username, isAdmin } = AppState.user;
  const statsMarkup = profileStatsMarkup();

  if(!username){
    wrap.innerHTML = `
      <div class="profile-grid">
        <form id="profileLoginForm" class="card profile-card profile-login" autocomplete="off">
          <fieldset>
            <legend>Log in</legend>
            <label class="label" for="profile-username">Username</label>
            <div class="profile-form__row">
              <input id="profile-username" name="username" class="input" type="text" required placeholder="Enter username" />
              <button type="submit" class="btn btn--primary">Login</button>
            </div>
            <p class="profile-hint">Use “admin” for debug tools.</p>
          </fieldset>
        </form>
        ${statsMarkup}
      </div>`;
    requestAnimationFrame(() => {
      const input = $('#profile-username');
      if(input) input.focus();
    });
    return;
  }

  wrap.innerHTML = `
    <div class="profile-grid">
      <div class="card profile-card profile-summary">
        <p class="profile-welcome">Welcome, <strong>${escapeHTML(username)}</strong></p>
        <button type="button" class="btn btn--ghost" data-action="profile-logout">Logout</button>
      </div>
      ${statsMarkup}
      ${isAdmin ? '<div class="card profile-card profile-debug" id="debugPanelRoot"></div>' : ''}
    </div>`;

  if(isAdmin){
    const debugRoot = wrap.querySelector('#debugPanelRoot');
    if(debugRoot){
      DebugTools.mount(debugRoot);
    }
  }
}

function handleProfileSubmit(event){
  const form = event.target.closest('#profileLoginForm');
  if(!form) return;
  event.preventDefault();
  const username = form.username?.value || '';
  const user = createUser(username);
  AppState.user = user;
  persistUser(user);
  renderProfileView();
}

function handleProfileClick(event){
  const logoutBtn = event.target.closest('[data-action="profile-logout"]');
  if(logoutBtn){
    event.preventDefault();
    AppState.user = createUser('');
    persistUser(AppState.user);
    renderProfileView();
  }
}

function initProfile(){
  const view = $('#view-profile');
  if(!view) return;
  renderProfileView();
  on(view, 'submit', handleProfileSubmit);
  on(view, 'click', handleProfileClick);
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
  window.__APP__ = { AppState };
}

// Init
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  const sidebarCtl = initSidebar();
  initInstall();
  initServiceWorker();
  initSettingsForm();
  initProfile();
  initRouter(sidebarCtl);
  exposeForDebug();
});

typeof module !== 'undefined' && (module.exports = { debounce, trapFocus });typeof module !== 'undefined' && (module.exports = { debounce, trapFocus });
