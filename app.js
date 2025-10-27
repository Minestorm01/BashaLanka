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

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const PROTOCOL_RELATIVE_PATTERN = /^\/\//;

function ensureTrailingSlash(value = '') {
  if (!value) return '';
  if (value === './') return './';
  return value.endsWith('/') ? value : `${value}/`;
}

function normaliseRelativeAssetPath(value = '') {
  return value.replace(/^\.?\/+/, '');
}

function determineRepoBasePath() {
  if (typeof window === 'undefined' || !window.location) {
    return './';
  }

  const { hostname = '', protocol = '', pathname = '' } = window.location;
  const lowerHost = hostname.toLowerCase();

  if (lowerHost.includes('github.io')) {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length) {
      return `/${segments[0]}/`;
    }
    return '/BashaLanka/';
  }

  if (
    protocol === 'file:' ||
    lowerHost === 'localhost' ||
    lowerHost === '127.0.0.1' ||
    lowerHost === '::1' ||
    lowerHost === '[::1]'
  ) {
    return './';
  }

  return '/';
}

const REPO_BASE_PATH = (() => determineRepoBasePath())();

function resolveAssetPath(path) {
  if (typeof path !== 'string') {
    return path;
  }

  const trimmed = path.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed) || PROTOCOL_RELATIVE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const cleaned = normaliseRelativeAssetPath(trimmed);

  if (!cleaned) {
    return REPO_BASE_PATH === './' ? './' : ensureTrailingSlash(REPO_BASE_PATH || '/');
  }

  if (REPO_BASE_PATH === './') {
    return `./${cleaned}`;
  }

  return `${ensureTrailingSlash(REPO_BASE_PATH || '/')}${cleaned}`;
}

if (typeof window !== 'undefined') {
  window.__BASHA_REPO_BASE_PATH__ = REPO_BASE_PATH;
  window.__BASHA_RESOLVE_ASSET_PATH__ = resolveAssetPath;
}

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
    romanized: true
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
  home:   $('#view-home'),
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
  
  const sectionMatch = h.match(/^section\/(\d+)/);
  if(sectionMatch){
    return { type: 'section', id: sectionMatch[1], view: 'learn' };
  }
  
  const route = ROUTES.includes(h) ? h : (h.split('?')[0]||'home');
  return { type: 'view', route };
}
function initRouter(sidebarCtl){
  function waitForLearnModule(callback, maxAttempts = 20){
    let attempts = 0;
    const check = () => {
      attempts++;
      if(typeof window.BashaLearn !== 'undefined'){
        callback();
      }else if(attempts < maxAttempts){
        setTimeout(check, 50);
      }else{
        console.warn('BashaLearn module did not initialize in time');
      }
    };
    check();
  }
  
  function apply(){
    const parsed = parseHash();
    if(parsed.type === 'section'){
      show('learn');
      sidebarCtl.setActive('learn');
      waitForLearnModule(() => {
        if(window.BashaLearn.renderSection){
          window.BashaLearn.renderSection(parsed.id);
        }
      });
    }else{
      show(parsed.route);
      sidebarCtl.setActive(parsed.route);
      if(parsed.route === 'learn'){
        waitForLearnModule(() => {
          if(window.BashaLearn.renderOverview){
            window.BashaLearn.renderOverview();
          }
        });
      }
    }
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

const EXERCISE_MODULE_BASES = (() => {
  const bases = [];
  const seen = new Set();

  const repoBasePath = REPO_BASE_PATH;
  const repoBaseWithSlash =
    repoBasePath === './' ? './' : ensureTrailingSlash(repoBasePath || '/');
  const exerciseAssetsBasePath =
    repoBaseWithSlash === './'
      ? './assets/Lessons/exercises/'
      : `${repoBaseWithSlash}assets/Lessons/exercises/`;

  const addCandidate = (candidate) => {
    if (!candidate) return;

    try {
      const resolved = new URL(exerciseAssetsBasePath, candidate).href;
      if (!seen.has(resolved)) {
        seen.add(resolved);
        bases.push(resolved);
      }
    } catch (err) {
      // Ignore invalid URLs — we'll fall back to other candidates.
    }
  };

  const addLocationDirectory = () => {
    if (typeof window === 'undefined' || !window.location) return;
    const { origin, pathname, href } = window.location;

    if (href) {
      addCandidate(href);
    }

    if (origin) {
      // Include the current directory so GitHub Pages deployments under a repo path work.
      if (pathname && pathname !== '/') {
        const directory = pathname.endsWith('/')
          ? pathname
          : pathname.replace(/[^/]*$/, '/');
        addCandidate(`${origin}${directory}`);
      }

      addCandidate(`${origin}/`);
    }
  };

  if (typeof document !== 'undefined') {
    if (document.currentScript?.src) {
      addCandidate(document.currentScript.src);
    }

    const scripts = document.getElementsByTagName('script');
    if (scripts && scripts.length) {
      for (const script of scripts) {
        if (script?.src) {
          addCandidate(script.src);
        }
      }
    }

    if (document.baseURI) {
      addCandidate(document.baseURI);
    }

    const manifest = document.querySelector('link[rel="manifest"]');
    if (manifest?.href) {
      addCandidate(manifest.href);
    }
  }

  addLocationDirectory();

  if (!bases.length) {
    const fallback = (() => {
      if (typeof document !== 'undefined' && document.baseURI) {
        try {
          return new URL(exerciseAssetsBasePath, document.baseURI).href;
        } catch (err) {
          // ignore and fall through
        }
      }

      if (typeof window !== 'undefined' && window.location?.href) {
        try {
          return new URL(exerciseAssetsBasePath, window.location.href).href;
        } catch (err) {
          // ignore and fall through
        }
      }

      return exerciseAssetsBasePath;
    })();

    bases.push(fallback);
  }

  if (typeof console !== 'undefined' && typeof console.log === 'function') {
    console.log('📦 Exercise module base URLs:', bases);
  }

  return bases;
})();

async function loadExerciseModule(path) {
  let lastError;

  for (const base of EXERCISE_MODULE_BASES) {
    try {
      const resolved = new URL(path, base);
      return await import(/* webpackIgnore: true */ resolved.href);
    } catch (error) {
      lastError = error;
    }
  }

  return Promise.reject(lastError || new Error(`Failed to load exercise module "${path}".`));
}

function loadExerciseModuleWithDefaults(path, defaultOptions) {
  return loadExerciseModule(path).then((mod) => {
    if (!defaultOptions || typeof mod?.default !== 'function') {
      return mod;
    }

    const init = mod.default.bind(mod);
    return Object.assign({}, mod, {
      default(options = {}) {
        const merged = { ...defaultOptions, ...options };
        return init(merged);
      }
    });
  });
}

const LESSON_SIMULATOR_EXERCISES = [
  {
    id: 'match-pairs',
    label: 'Match Pairs',
    description: 'Match Sinhala words and phrases to their translations.',
    loader: () => loadExerciseModule('MatchPairs/index.js')
  },
  {
    id: 'translate-to-target',
    label: 'Translate to Sinhala',
    description: 'Type the Sinhala translation for the given prompt.',
    loader: () => loadExerciseModule('TranslateToTarget/index.js')
  },
  {
    id: 'translate-to-base',
    label: 'Translate to English',
    description: 'Translate Sinhala sentences back into English.',
    loader: () => loadExerciseModule('TranslateToBase/index.js')
  },
  {
    id: 'picture-choice',
    label: 'Picture Choice',
    description: 'Choose the image that best matches the cue.',
    loader: () => loadExerciseModule('PictureChoice/index.js')
  },
  {
    id: 'fill-blank',
    label: 'Fill in the Blank',
    description: 'Complete sentences by supplying the missing word.',
    loader: () => loadExerciseModule('FillBlank/index.js')
  },
  {
    id: 'listening',
    label: 'Listening',
    description: 'Listen to audio and identify what you heard.',
    loader: () => loadExerciseModule('Listening/index.js')
  },
  {
    id: 'dialogue',
    label: 'Dialogue',
    description: 'Step through a guided conversation.',
    loader: () => loadExerciseModule('Dialogue/index.js')
  },
  {
    id: 'wordbank-sinhala',
    label: 'Word Bank (English → Sinhala)',
    description: 'Rebuild the Sinhala sentence from English prompts.',
    loader: () => loadExerciseModule('WordBankSinhala/index.js')
  },
  {
    id: 'wordbank-english',
    label: 'Word Bank (Sinhala → English)',
    description: 'Rebuild the English sentence from Sinhala prompts.',
    loader: () => loadExerciseModule('WordBankEnglish/index.js')
  },
  {
    id: 'speak',
    label: 'Speaking',
    description: 'Practice pronouncing Sinhala aloud.',
    loader: () => loadExerciseModule('Speak/index.js')
  }
];

const LESSON_SIMULATOR_EXERCISE_LOOKUP = new Map(LESSON_SIMULATOR_EXERCISES.map(entry => [entry.id, entry]));

const LessonSimulator = (() => {
  let overlayEl = null;
  let contentEl = null;
  let closeBtn = null;
  let lastTrigger = null;
  let keyHandlerBound = false;
  let simulationState = null;

  function ensureOverlay(){
    if(overlayEl) return;
    overlayEl = document.createElement('div');
    overlayEl.id = 'lessonSimulator';
    overlayEl.className = 'lesson-simulator-overlay';
    overlayEl.setAttribute('hidden', '');
    overlayEl.innerHTML = `
      <div class="lesson-simulator-overlay__scrim" data-sim-action="close"></div>
      <div class="lesson-simulator" role="dialog" aria-modal="true" aria-labelledby="lessonSimulatorTitle">
        <button type="button" class="lesson-simulator__close" aria-label="Exit lesson simulator" data-sim-action="close">✕</button>
        <div class="lesson-simulator__content" id="lessonSimulatorContent"></div>
      </div>`;
    document.body.appendChild(overlayEl);
    contentEl = overlayEl.querySelector('#lessonSimulatorContent');
    closeBtn = overlayEl.querySelector('.lesson-simulator__close');
    overlayEl.addEventListener('click', event => {
      if(event.target && event.target.dataset && event.target.dataset.simAction === 'close'){
        event.preventDefault();
        close();
      }
    });
  }

  function onKeydown(event){
    if(event.key === 'Escape' && overlayEl && !overlayEl.hasAttribute('hidden')){
      event.preventDefault();
      close();
    }
  }

  function renderShell(config = {}){
    if(!contentEl) return null;
    const {
      lessonTitle = 'Lesson',
      lessonNumberText = 'Lesson simulator',
      sectionTitle = '',
      unitTitle = ''
    } = config;

    contentEl.innerHTML = '';

    const header = document.createElement('header');
    header.className = 'lesson-simulator__header';

    const eyebrow = document.createElement('p');
    eyebrow.className = 'lesson-simulator__eyebrow';
    eyebrow.textContent = lessonNumberText || 'Lesson simulator';
    header.appendChild(eyebrow);

    const title = document.createElement('h2');
    title.id = 'lessonSimulatorTitle';
    title.className = 'lesson-simulator__title';
    title.textContent = lessonTitle || 'Lesson';
    header.appendChild(title);

    const meta = document.createElement('p');
    meta.className = 'lesson-simulator__meta';
    const metaParts = [sectionTitle, unitTitle].filter(Boolean);
    meta.textContent = metaParts.length ? metaParts.join(' • ') : 'Step through the selected exercises.';
    header.appendChild(meta);

    const progress = document.createElement('p');
    progress.className = 'lesson-simulator__progress';
    progress.textContent = 'Preparing exercises…';

    const stage = document.createElement('div');
    stage.className = 'lesson-simulator__stage';

    const status = document.createElement('p');
    status.className = 'lesson-simulator__status';
    status.textContent = 'Loading…';

    const controls = document.createElement('div');
    controls.className = 'lesson-simulator__controls';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'btn btn--primary lesson-simulator__next';
    nextBtn.textContent = 'Next exercise';
    nextBtn.hidden = true;
    nextBtn.disabled = true;
    controls.appendChild(nextBtn);

    contentEl.append(header, progress, stage, status, controls);

    return { stage, status, progress, nextBtn };
  }

  function clearNextAction(options = {}){
    if(!simulationState || !simulationState.nextBtn) return;
    const { hide = true } = options;
    if(simulationState.autoAdvanceTimer){
      clearTimeout(simulationState.autoAdvanceTimer);
      simulationState.autoAdvanceTimer = null;
    }
    if(simulationState.nextHandler){
      simulationState.nextBtn.removeEventListener('click', simulationState.nextHandler);
      simulationState.nextHandler = null;
    }
    simulationState.nextBtn.disabled = true;
    if(hide){
      simulationState.nextBtn.hidden = true;
    }
  }

  function setNextAction({ label = 'Continue', callback, autoAdvance } = {}){
    if(!simulationState || !simulationState.nextBtn) return;
    clearNextAction({ hide: false });
    simulationState.nextBtn.hidden = false;
    simulationState.nextBtn.textContent = label;
    if(typeof callback === 'function'){
      simulationState.nextHandler = callback;
      simulationState.nextBtn.disabled = false;
      simulationState.nextBtn.addEventListener('click', callback);
      if(autoAdvance){
        simulationState.autoAdvanceTimer = window.setTimeout(() => {
          if(simulationState && simulationState.nextHandler === callback){
            callback();
          }
        }, autoAdvance);
      }
    }else{
      simulationState.nextBtn.disabled = true;
    }
  }

  async function runExercise(index){
    if(!simulationState) return;
    if(index >= simulationState.total){
      finishSimulation();
      return;
    }

    simulationState.currentIndex = index;
    const exercises = simulationState.exercises;
    const exerciseId = exercises[index];
    const meta = LESSON_SIMULATOR_EXERCISE_LOOKUP.get(exerciseId) || { id: exerciseId };
    const label = meta.label || exerciseId;

    if(simulationState.progressEl){
      simulationState.progressEl.textContent = `Exercise ${index + 1} of ${simulationState.total}: ${label}`;
    }
    if(simulationState.statusEl){
      simulationState.statusEl.textContent = 'Complete this exercise to continue.';
    }

    clearNextAction({ hide: false });
    if(simulationState.nextBtn){
      simulationState.nextBtn.hidden = false;
      simulationState.nextBtn.textContent = index === simulationState.total - 1 ? 'Finish simulation' : 'Next exercise';
      simulationState.nextBtn.disabled = true;
    }

    const stage = simulationState.stageEl;
    if(stage){
      stage.innerHTML = `<div class="lesson-simulator__loader" role="status">Loading ${label}…</div>`;
    }

    const token = {};
    simulationState.activeToken = token;

    if(!meta.loader || typeof meta.loader !== 'function'){
      if(stage){
        stage.innerHTML = `<p class="lesson-simulator__error">Exercise "${label}" is not available in this build.</p>`;
      }
      if(simulationState.statusEl){
        simulationState.statusEl.textContent = 'This exercise is unavailable. You can skip it.';
      }
      setNextAction({ label: 'Skip exercise', callback: () => runExercise(index + 1) });
      return;
    }

    try{
      // Set global lesson context so exercises know which lesson data to use
      window.BashaLanka = window.BashaLanka || {};
      const existingLesson = window.BashaLanka.currentLesson || {};
      const lessonMeta = existingLesson.meta || simulationState?.config?.lessonMeta || null;
      const detail = existingLesson.detail || {};

      if(!existingLesson.meta && lessonMeta){
        existingLesson.meta = lessonMeta;
      }
      if(!existingLesson.detail){
        existingLesson.detail = detail;
      }

      const fillDetailField = (field, keys = [field]) => {
        if(detail[field] != null) return;
        if(!lessonMeta) return;
        for(const key of keys){
          if(lessonMeta[key] != null){
            detail[field] = lessonMeta[key];
            return;
          }
        }
      };

      fillDetailField('id', ['id', 'lessonId']);
      fillDetailField('title', ['title', 'lessonTitle']);
      fillDetailField('sectionId');
      fillDetailField('unitId');
      fillDetailField('lessonId', ['lessonId', 'id']);

      existingLesson.exercise = meta;
      window.BashaLanka.currentLesson = existingLesson;

      const mod = await meta.loader();
      if(!simulationState || simulationState.activeToken !== token) return;
      const init = typeof mod?.default === 'function' ? mod.default : null;
      if(typeof init !== 'function'){
        throw new Error('Exercise init function missing');
      }

      const host = document.createElement('div');
      host.className = 'lesson-simulator__exercise-host';
      host.setAttribute('data-exercise', meta.slot || meta.id);
      if(stage){
        stage.innerHTML = '';
        stage.appendChild(host);
      }

      let completed = false;
      const handleComplete = () => {
        if(completed || !simulationState || simulationState.currentIndex !== index) return;
        completed = true;
        if(simulationState.statusEl){
          simulationState.statusEl.textContent = index === simulationState.total - 1
            ? 'All exercises finished!'
            : 'Nice work! Preparing the next exercise…';
        }
        if(index === simulationState.total - 1){
          finishSimulation();
        }else{
          setNextAction({ label: 'Next exercise', callback: () => runExercise(index + 1), autoAdvance: 1200 });
        }
      };

      const exerciseOptions = { target: host, onComplete: handleComplete };
      const lessonUnitIdValue = existingLesson?.detail?.unitId ?? existingLesson?.meta?.unitId;
      const numericUnitId = Number(lessonUnitIdValue);
      if (!Number.isNaN(numericUnitId) && numericUnitId > 0) {
        exerciseOptions.unitId = numericUnitId;
      }

      await init(exerciseOptions);
      if(contentEl){
        contentEl.scrollTop = 0;
      }
    }catch(err){
      console.error('Lesson simulator failed to load exercise', err);
      if(!simulationState || simulationState.activeToken !== token) return;
      if(simulationState.stageEl){
        simulationState.stageEl.innerHTML = `<p class="lesson-simulator__error">We couldn’t load ${label}. You can skip it.</p>`;
      }
      if(simulationState.statusEl){
      simulationState.statusEl.textContent = 'The exercise encountered an error.';
      }
      setNextAction({ label: 'Skip exercise', callback: () => runExercise(index + 1) });
    }
  }

  function finishSimulation(){
    if(!simulationState || simulationState.completed) return;
    simulationState.completed = true;
    if(simulationState.stageEl){
      simulationState.stageEl.innerHTML = '<div class="lesson-simulator__complete">Lesson simulation complete! 🎉</div>';
    }
    if(simulationState.statusEl){
      simulationState.statusEl.textContent = 'Lesson simulation complete. Returning to the admin tools.';
    }
    setNextAction({ label: 'Return to admin', callback: close, autoAdvance: 1500 });
  }

  function open(config = {}){
    ensureOverlay();
    const shell = renderShell(config) || {};
    const exercises = Array.isArray(config.selectedExercises)
      ? config.selectedExercises.map(String).filter(Boolean)
      : [];

    if(typeof window !== 'undefined'){
      window.BashaLanka = window.BashaLanka || {};
      window.BashaLanka.currentLesson = {
        meta: config.lessonMeta || null,
        detail: config.lessonDetail || null
      };
    }

    simulationState = {
      config,
      exercises,
      total: exercises.length,
      currentIndex: -1,
      stageEl: shell.stage || null,
      statusEl: shell.status || null,
      progressEl: shell.progress || null,
      nextBtn: shell.nextBtn || null,
      nextHandler: null,
      autoAdvanceTimer: null,
      completed: false,
      activeToken: null
    };

    lastTrigger = config && config.trigger ? config.trigger : null;

    overlayEl.removeAttribute('hidden');
    document.body.classList.add('lesson-simulator-open');
    if(!keyHandlerBound){
      document.addEventListener('keydown', onKeydown);
      keyHandlerBound = true;
    }
    requestAnimationFrame(() => {
      if(closeBtn){
        closeBtn.focus();
      }
    });

    if(!simulationState.total){
      if(simulationState.progressEl){
        simulationState.progressEl.textContent = 'No exercises selected.';
      }
      if(simulationState.statusEl){
        simulationState.statusEl.textContent = 'Choose at least one exercise to run the simulator.';
      }
      if(simulationState.stageEl){
        simulationState.stageEl.innerHTML = '<p class="lesson-simulator__error">No exercises were selected.</p>';
      }
      setNextAction({ label: 'Return to admin', callback: close });
      return;
    }

    runExercise(0);
  }

  function close(){
    if(!overlayEl) return;
    if(simulationState){
      clearNextAction();
      simulationState = null;
    }
    if(!overlayEl.hasAttribute('hidden')){
      overlayEl.setAttribute('hidden', '');
    }
    document.body.classList.remove('lesson-simulator-open');
    if(keyHandlerBound){
      document.removeEventListener('keydown', onKeydown);
      keyHandlerBound = false;
    }
    if(contentEl){
      contentEl.innerHTML = '';
    }
    if(lastTrigger && typeof lastTrigger.focus === 'function'){
      lastTrigger.focus();
    }
  }

  return Object.freeze({ open, close });
})();

const DebugTools = (() => {
  const controls = [];
  let controlsContainer = null;
  let sectionSelect = null;
  let hostEl = null;
  const lessonOptionMap = new Map();
  const simulatorState = {
    container: null,
    lessonSelect: null,
    exerciseToggle: null,
    exerciseMenu: null,
    summary: null,
    startButton: null,
    selectedExercises: new Set()
  };
  const courseLessonsCache = {
    promise: null,
    sections: []
  };
  let documentClickHandler = null;

  function isReadyStatus(value) {
    if (value === null || value === undefined) return true;
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return true;
    return normalized === 'ready' || normalized === 'published';
  }

  function stripQuotes(value = '') {
    return value.replace(/^['"]+|['"]+$/g, '');
  }

  function parseUnitOverview(text = '') {
    const result = {
      lessonIds: [],
      lessonDetails: []
    };

    if (!text) {
      return result;
    }

    const frontMatterMatch = text.match(/^---\s*([\s\S]*?)\n---\s*/);
    let body = text;

    if (frontMatterMatch) {
      const frontMatter = frontMatterMatch[1] || '';
      body = text.slice(frontMatterMatch[0].length);
      frontMatter.split(/\r?\n/).forEach(line => {
        const trimmed = line.trim();
        if (!trimmed) return;
        if (/^lessons:/i.test(trimmed)) {
          const listMatch = trimmed.match(/lessons:\s*\[([^\]]*)\]/i);
          if (listMatch) {
            const items = listMatch[1]
              .split(',')
              .map(entry => stripQuotes(entry.trim()))
              .filter(Boolean);
            result.lessonIds = items;
          }
        }
      });
    }

    body.split(/\r?\n/).forEach(line => {
      if (!line) return;
      const plain = line.replace(/\*\*/g, '').trim();
      if (!plain.startsWith('-')) return;
      const withoutBullet = plain.replace(/^-+\s*/, '');
      const lessonMatch = withoutBullet.match(/^Lesson\s+(\d+)(.*)$/i);
      if (!lessonMatch) return;
      const number = parseInt(lessonMatch[1], 10);
      let remainder = (lessonMatch[2] || '').trim();
      remainder = remainder.replace(/^[:—–-]+\s*/, '').trim();
      result.lessonDetails.push({
        number: Number.isFinite(number) ? number : result.lessonDetails.length + 1,
        title: remainder
      });
    });

    return result;
  }

  function ensureCourseLessons() {
    if (courseLessonsCache.sections.length) {
      return Promise.resolve(courseLessonsCache.sections);
    }

    if (courseLessonsCache.promise) {
      return courseLessonsCache.promise;
    }

    const load = (async () => {
      try {
        const mapPath = resolveAssetPath('assets/Lessons/course.map.json');
        const res = await fetch(mapPath, { cache: 'no-cache' });
        if (!res.ok) {
          throw new Error('Failed to load course map');
        }
        const map = await res.json();
        const sections = Array.isArray(map && map.sections) ? map.sections : [];
        const readySections = [];

        for (let sectionIndex = 0; sectionIndex < sections.length; sectionIndex += 1) {
          const section = sections[sectionIndex] || {};
          if (!isReadyStatus(section.status)) {
            continue;
          }
          const sectionId = section.id || `section-${sectionIndex + 1}`;
          const sectionNumber = typeof section.number === 'number'
            ? section.number
            : sectionIndex + 1;
          const rawSectionTitle = typeof section.title === 'string' ? section.title.trim() : '';
          const sectionTitle = rawSectionTitle || `Section ${sectionNumber}`;
          const units = Array.isArray(section.units) ? section.units : [];
          const readyUnits = [];

          for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
            const unit = units[unitIndex] || {};
            if (!isReadyStatus(unit.status)) {
              continue;
            }
            const unitId = unit.id || `unit-${unitIndex + 1}`;
            const unitNumber = typeof unit.number === 'number'
              ? unit.number
              : unitIndex + 1;
            const rawUnitTitle = typeof unit.title === 'string' ? unit.title.trim() : '';
            const unitTitle = rawUnitTitle || `Unit ${unitNumber}`;
            const pathRef = normaliseRelativeAssetPath((unit.path_ref || `sections/${sectionId}/units/${unitId}`).trim());
            const overviewPath = resolveAssetPath(`assets/Lessons/${pathRef}/overview.md`);
            let overviewText = '';

            try {
              const overviewRes = await fetch(overviewPath, { cache: 'no-cache' });
              if (!overviewRes.ok) {
                continue;
              }
              overviewText = await overviewRes.text();
            } catch (err) {
              console.warn('Failed to load unit overview', unitId, err);
              continue;
            }

            const overviewData = parseUnitOverview(overviewText);
            const lessonCount = Math.max(overviewData.lessonIds.length, overviewData.lessonDetails.length);
            if (!lessonCount) {
              continue;
            }

            const lessons = [];
            for (let lessonIndex = 0; lessonIndex < lessonCount; lessonIndex += 1) {
              const rawId = overviewData.lessonIds[lessonIndex] || `lesson-${String(lessonIndex + 1).padStart(2, '0')}`;
              const lessonId = stripQuotes(rawId);
              if (!lessonId) {
                continue;
              }
              const detail = overviewData.lessonDetails[lessonIndex] || {};
              const lessonNumber = Number.isFinite(detail.number) ? detail.number : lessonIndex + 1;
              const title = (detail.title || '').trim();
              lessons.push({
                id: lessonId,
                number: lessonNumber,
                title
              });
            }

            if (!lessons.length) {
              continue;
            }

            readyUnits.push({
              id: unitId,
              number: unitNumber,
              title: unitTitle,
              lessons
            });
          }

          if (readyUnits.length) {
            readySections.push({
              id: sectionId,
              number: sectionNumber,
              title: sectionTitle,
              units: readyUnits
            });
          }
        }

        courseLessonsCache.sections = readySections;
        return readySections;
      } finally {
        courseLessonsCache.promise = null;
      }
    })();

    courseLessonsCache.promise = load;
    return load;
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

  function updateExerciseSummary(){
    if(!simulatorState.summary) return;
    const count = simulatorState.selectedExercises.size;
    if(!count){
      simulatorState.summary.textContent = 'No exercises selected';
      return;
    }
    const labels = Array.from(simulatorState.selectedExercises).map(id => {
      const meta = LESSON_SIMULATOR_EXERCISE_LOOKUP.get(id);
      return meta ? meta.label : id;
    });
    if(count <= 2){
      simulatorState.summary.textContent = labels.join(', ');
    }else{
      simulatorState.summary.textContent = `${count} exercises selected`;
    }
  }

  function updateStartButtonState(){
    if(!simulatorState.startButton) return;
    const hasLesson = Boolean(simulatorState.lessonSelect && simulatorState.lessonSelect.value);
    const hasExercises = simulatorState.selectedExercises.size > 0;
    simulatorState.startButton.disabled = !(hasLesson && hasExercises);
  }

  function closeExerciseMenu(){
    if(!simulatorState.exerciseMenu) return;
    simulatorState.exerciseMenu.hidden = true;
    if(simulatorState.exerciseToggle){
      simulatorState.exerciseToggle.setAttribute('aria-expanded', 'false');
    }
  }

  function toggleExerciseMenu(){
    if(!simulatorState.exerciseMenu) return;
    const willOpen = simulatorState.exerciseMenu.hidden;
    simulatorState.exerciseMenu.hidden = !willOpen;
    if(simulatorState.exerciseToggle){
      simulatorState.exerciseToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
    }
  }

  function handleExerciseChange(event){
    const input = event.target;
    if(!input || input.type !== 'checkbox') return;
    const value = input.value;
    if(!value) return;
    if(input.checked){
      simulatorState.selectedExercises.add(value);
    }else{
      simulatorState.selectedExercises.delete(value);
    }
    updateExerciseSummary();
    updateStartButtonState();
  }

  function handleDocumentClick(event){
    if(!simulatorState.exerciseMenu || simulatorState.exerciseMenu.hidden) return;
    if(!simulatorState.container) return;
    if(simulatorState.exerciseMenu.contains(event.target)) return;
    if(simulatorState.exerciseToggle && simulatorState.exerciseToggle.contains(event.target)) return;
    closeExerciseMenu();
  }

  function populateLessons(){
    if(!simulatorState.lessonSelect) return;
    const select = simulatorState.lessonSelect;
    select.disabled = true;
    select.innerHTML = '<option value="">Loading…</option>';
    lessonOptionMap.clear();
    updateStartButtonState();
    const buildOptions = sections => {
      const options = [];
      sections.forEach(section => {
        const sectionNumber = section.number || 0;
        const sectionTitle = section.title || (sectionNumber ? `Section ${sectionNumber}` : 'Section');
        const units = Array.isArray(section.units) ? section.units : [];
        units.forEach(unit => {
          const unitId = unit.id || '';
          if(!unitId) return;
          const unitNumber = unit.number || 0;
          const unitTitle = unit.title || (unitNumber ? `Unit ${unitNumber}` : 'Unit');
          const lessons = Array.isArray(unit.lessons) ? unit.lessons : [];
          lessons.forEach((lesson, index) => {
            const lessonId = lesson && lesson.id ? lesson.id : '';
            if(!lessonId) return;
            const lessonNumber = lesson.number || index + 1;
            const lessonTitleRaw = typeof lesson.title === 'string' ? lesson.title.trim() : '';
            const hasTitle = lessonTitleRaw.length > 0;
            const lessonTitleText = hasTitle
              ? `Lesson ${lessonNumber}: ${lessonTitleRaw}`
              : `Lesson ${lessonNumber}`;
            const textParts = [];
            if(sectionNumber){
              textParts.push(`Section ${sectionNumber}`);
              if(sectionTitle && sectionTitle !== `Section ${sectionNumber}`){
                textParts.push(sectionTitle);
              }
            }else if(sectionTitle){
              textParts.push(sectionTitle);
            }
            if(unitNumber){
              textParts.push(`Unit ${unitNumber}: ${unitTitle}`);
            }else if(unitTitle){
              textParts.push(unitTitle);
            }
            textParts.push(lessonTitleText);
            const key = [section.id || sectionNumber, unitId, lessonId].join('|');
            lessonOptionMap.set(key, {
              sectionId: section.id || '',
              sectionNumber,
              sectionTitle,
              unitId,
              unitNumber,
              unitTitle,
              lessonId,
              lessonTitle: lessonTitleText,
              lessonIndex: lessonNumber,
              totalLessons: lessons.length || 0,
              skillId: lesson.skillId || '',
              levelId: lesson.levelId || ''
            });
            options.push(`<option value="${key}">${escapeHTML(textParts.join(' • '))}</option>`);
          });
        });
      });
      if(options.length){
        select.innerHTML = `<option value="">Choose a lesson</option>${options.join('')}`;
        select.disabled = false;
      }else{
        select.innerHTML = '<option value="">No lessons available</option>';
        select.disabled = true;
      }
      updateStartButtonState();
    };

    ensureCourseLessons().then(buildOptions).catch(() => {
      select.innerHTML = '<option value="">Failed to load lessons</option>';
      select.disabled = true;
      updateStartButtonState();
    });
  }

  function fetchLessonDetail(meta){
    if(!meta || !meta.unitId) return Promise.resolve(null);
    return fetch(`data/${meta.unitId}.lessons.json`, { cache: 'no-cache' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if(!data || !Array.isArray(data.lessons)) return null;
        return data.lessons.find(item => item.id === meta.lessonId) || null;
      })
      .catch(() => null);
  }

  function handleStartClick(){
    if(!simulatorState.lessonSelect || !simulatorState.startButton) return;
    const value = simulatorState.lessonSelect.value;
    if(!value) return;
    const meta = lessonOptionMap.get(value);
    if(!meta) return;
    const exercises = Array.from(simulatorState.selectedExercises);
    if(!exercises.length) return;
    const learn = window.__LEARN__;
    const params = {
      unitId: meta.unitId,
      lessonId: meta.lessonId,
      skillId: meta.skillId,
      levelId: meta.levelId
    };
    const fallbackCounter = meta.totalLessons && meta.lessonIndex
      ? `Lesson ${meta.lessonIndex} of ${meta.totalLessons}`
      : '';

    simulatorState.startButton.disabled = true;

    if(learn && typeof learn.getLessonPosition === 'function'){
      const positionPromise = learn.getLessonPosition(params);
      const counterPromise = typeof learn.getLessonCounterText === 'function'
        ? learn.getLessonCounterText(params)
        : Promise.resolve('');

      Promise.all([positionPromise, counterPromise]).then(([position, counterText]) => {
        const lessonDetail = position && position.lesson ? position.lesson : null;
        const lessonTitle = (lessonDetail && lessonDetail.title) || meta.lessonTitle;
        const sectionTitle = (position && position.section && position.section.title) || meta.sectionTitle;
        const unitTitle = (position && position.unit && position.unit.title) || meta.unitTitle;
        const counter = counterText || (position && position.currentIndex && position.totalLessons
          ? `Lesson ${position.currentIndex} of ${position.totalLessons}`
          : fallbackCounter);
        LessonSimulator.open({
          lessonTitle,
          sectionTitle,
          unitTitle,
          lessonNumberText: counter,
          lessonDetail,
          lessonMeta: meta,
          selectedExercises: exercises,
          trigger: simulatorState.startButton
        });
      }).catch(() => {
        fetchLessonDetail(meta).then(lessonDetail => {
          LessonSimulator.open({
            lessonTitle: (lessonDetail && lessonDetail.title) || meta.lessonTitle,
            sectionTitle: meta.sectionTitle,
            unitTitle: meta.unitTitle,
            lessonNumberText: fallbackCounter,
            lessonDetail,
            lessonMeta: meta,
            selectedExercises: exercises,
            trigger: simulatorState.startButton
          });
        });
      }).finally(() => {
        closeExerciseMenu();
        simulatorState.startButton.disabled = false;
        updateStartButtonState();
      });
      return;
    }

    fetchLessonDetail(meta).then(lessonDetail => {
      LessonSimulator.open({
        lessonTitle: (lessonDetail && lessonDetail.title) || meta.lessonTitle,
        sectionTitle: meta.sectionTitle,
        unitTitle: meta.unitTitle,
        lessonNumberText: fallbackCounter,
        lessonDetail,
        lessonMeta: meta,
        selectedExercises: exercises,
        trigger: simulatorState.startButton
      });
    }).finally(() => {
      closeExerciseMenu();
      simulatorState.startButton.disabled = false;
      updateStartButtonState();
    });
  }

  function registerDebugControl(label, callback){
    const entry = { label, callback };
    controls.push(entry);
    if(controlsContainer) appendControl(entry);
    return entry;
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
        <div class="debug-panel__simulator" id="lessonSimulatorConfig">
          <div class="debug-panel__simulator-header">
            <h3 id="lesson-sim-title">Lesson simulator</h3>
            <p class="debug-panel__simulator-hint">Preview lesson content and selected exercises.</p>
          </div>
          <label class="debug-panel__field" for="debugLessonSelect">
            <span>Lesson</span>
            <select id="debugLessonSelect" class="select">
              <option value="">Loading…</option>
            </select>
          </label>
          <div class="debug-multiselect" data-role="lesson-exercise-picker">
            <button type="button" class="btn btn--ghost debug-multiselect__toggle" id="debugExerciseToggle" aria-haspopup="true" aria-expanded="false">Choose exercises</button>
            <div class="debug-multiselect__menu" id="debugExerciseMenu" hidden>
              ${LESSON_SIMULATOR_EXERCISES.map(ex => `<label class="debug-multiselect__option"><input type="checkbox" value="${ex.id}"> ${escapeHTML(ex.label)}</label>`).join('')}
            </div>
            <p class="debug-multiselect__summary" id="debugExerciseSummary">No exercises selected</p>
          </div>
          <button type="button" class="btn btn--primary debug-simulator-start" id="debugStartLessonBtn" disabled>Start lesson</button>
        </div>
      </section>`;
    controlsContainer = root.querySelector('.debug-panel__controls');
    sectionSelect = root.querySelector('#debugSectionSelect');
    simulatorState.container = root.querySelector('#lessonSimulatorConfig');
    simulatorState.lessonSelect = root.querySelector('#debugLessonSelect');
    simulatorState.exerciseToggle = root.querySelector('#debugExerciseToggle');
    simulatorState.exerciseMenu = root.querySelector('#debugExerciseMenu');
    simulatorState.summary = root.querySelector('#debugExerciseSummary');
    simulatorState.startButton = root.querySelector('#debugStartLessonBtn');
    simulatorState.selectedExercises = new Set();
    populateSections();
    populateLessons();
    controls.forEach(appendControl);
    updateExerciseSummary();
    updateStartButtonState();
    if(simulatorState.lessonSelect){
      simulatorState.lessonSelect.addEventListener('change', () => {
        updateStartButtonState();
        closeExerciseMenu();
      });
    }
    if(simulatorState.exerciseMenu){
      simulatorState.exerciseMenu.addEventListener('change', handleExerciseChange);
    }
    if(simulatorState.exerciseToggle){
      simulatorState.exerciseToggle.addEventListener('click', event => {
        event.preventDefault();
        toggleExerciseMenu();
      });
    }
    if(simulatorState.startButton){
      simulatorState.startButton.addEventListener('click', handleStartClick);
    }
    if(!documentClickHandler){
      documentClickHandler = handleDocumentClick;
      document.addEventListener('click', documentClickHandler);
    }
  }

  function unmount(){
    if(hostEl){
      hostEl.innerHTML = '';
    }
    controlsContainer = null;
    sectionSelect = null;
    hostEl = null;
    lessonOptionMap.clear();
    simulatorState.selectedExercises.clear();
    simulatorState.container = null;
    simulatorState.lessonSelect = null;
    simulatorState.exerciseToggle = null;
    simulatorState.exerciseMenu = null;
    simulatorState.summary = null;
    simulatorState.startButton = null;
    if(documentClickHandler){
      document.removeEventListener('click', documentClickHandler);
      documentClickHandler = null;
    }
  }

  window.addEventListener('learn:sections-loaded', () => {
    populateSections();
    populateLessons();
  });

  return {
    registerDebugControl,
    mount,
    unmount,
    refresh: () => {
      populateSections();
      populateLessons();
    }
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
