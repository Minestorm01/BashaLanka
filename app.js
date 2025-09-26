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

const LESSON_SIMULATOR_EXERCISES = [
  { id: 'match-pairs', label: 'Match Pairs', description: 'Match Sinhala words and phrases to their translations.' },
  { id: 'word-bank', label: 'Word Bank', description: 'Assemble answers from a bank of word tiles.' },
  { id: 'translate-to-target', label: 'Translate to Sinhala', description: 'Type the Sinhala translation for the given prompt.' },
  { id: 'translate-to-base', label: 'Translate to English', description: 'Translate Sinhala sentences back into English.' },
  { id: 'picture-choice', label: 'Picture Choice', description: 'Choose the image that best matches the cue.' },
  { id: 'fill-blank', label: 'Fill in the Blank', description: 'Complete sentences by supplying the missing word.' },
  { id: 'listening', label: 'Listening', description: 'Listen to audio and identify what you heard.' },
  { id: 'dialogue', label: 'Dialogue', description: 'Step through a guided conversation.' },
  { id: 'speak', label: 'Speaking', description: 'Practice pronouncing Sinhala aloud.' }
];

const LESSON_SIMULATOR_EXERCISE_LOOKUP = new Map(LESSON_SIMULATOR_EXERCISES.map(entry => [entry.id, entry]));

const LessonSimulator = (() => {
  let overlayEl = null;
  let contentEl = null;
  let closeBtn = null;
  let lastTrigger = null;
  let keyHandlerBound = false;

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

  function render(config = {}){
    if(!contentEl) return;
    const {
      lessonTitle = 'Lesson',
      sectionTitle = '',
      unitTitle = '',
      lessonNumberText = '',
      lessonDetail = null,
      selectedExercises = []
    } = config;

    const safeLessonTitle = escapeHTML(lessonTitle);
    const safeSection = sectionTitle ? escapeHTML(sectionTitle) : '';
    const safeUnit = unitTitle ? escapeHTML(unitTitle) : '';
    const metaParts = [safeSection, safeUnit].filter(Boolean);
    const metaLine = metaParts.length ? metaParts.join(' • ') : 'Preview lesson content and flow.';
    const eyebrow = lessonNumberText ? escapeHTML(lessonNumberText) : 'Lesson simulator';

    const objectives = Array.isArray(lessonDetail?.objectives) ? lessonDetail.objectives : [];
    const contentBlocks = Array.isArray(lessonDetail?.content_blocks) ? lessonDetail.content_blocks : [];
    const vocab = Array.isArray(lessonDetail?.vocab) ? lessonDetail.vocab : [];

    const exercises = Array.isArray(selectedExercises) ? selectedExercises : [];
    const exercisesMarkup = exercises.length
      ? exercises.map(id => {
          const meta = LESSON_SIMULATOR_EXERCISE_LOOKUP.get(id) || { label: id, description: '' };
          const label = escapeHTML(meta.label || id);
          const description = meta.description ? `<p class="lesson-simulator__exercise-desc">${escapeHTML(meta.description)}</p>` : '';
          return `<li class="lesson-simulator__exercise"><span class="lesson-simulator__exercise-name">${label}</span>${description}</li>`;
        }).join('')
      : '<li class="lesson-simulator__empty">No exercises selected.</li>';

    const objectivesMarkup = objectives.length
      ? objectives.map(item => `<li>${escapeHTML(item)}</li>`).join('')
      : '<li class="lesson-simulator__empty">No objectives listed for this lesson.</li>';

    const vocabMarkup = vocab.length
      ? `<section class="lesson-simulator__section">
          <h3>Key vocabulary</h3>
          <ul class="lesson-simulator__vocab">${vocab.map(entry => `
            <li>
              <span class="lesson-simulator__vocab-si">${escapeHTML(entry.si || '')}</span>
              <span class="lesson-simulator__vocab-translit">${escapeHTML(entry.translit || '')}</span>
              <span class="lesson-simulator__vocab-en">${escapeHTML(entry.en || '')}</span>
            </li>`).join('')}
          </ul>
        </section>`
      : '';

    const contentMarkup = contentBlocks.length
      ? contentBlocks.map(block => {
          const title = escapeHTML(block.type || 'Block');
          const body = escapeHTML(block.body || '');
          return `<article class="lesson-simulator__block">
            <header class="lesson-simulator__block-header">${title}</header>
            <p class="lesson-simulator__block-body">${body}</p>
          </article>`;
        }).join('')
      : '<p class="lesson-simulator__empty">No content blocks were found for this lesson.</p>';

    contentEl.innerHTML = `
      <header class="lesson-simulator__header">
        <p class="lesson-simulator__eyebrow">${eyebrow}</p>
        <h2 id="lessonSimulatorTitle">${safeLessonTitle}</h2>
        <p class="lesson-simulator__meta">${metaLine}</p>
      </header>
      <section class="lesson-simulator__section">
        <h3>Objectives</h3>
        <ul class="lesson-simulator__objectives">${objectivesMarkup}</ul>
      </section>
      <section class="lesson-simulator__section">
        <h3>Selected exercises</h3>
        <ul class="lesson-simulator__exercise-list">${exercisesMarkup}</ul>
      </section>
      ${vocabMarkup}
      <section class="lesson-simulator__section">
        <h3>Lesson content</h3>
        <div class="lesson-simulator__blocks">${contentMarkup}</div>
      </section>`;
  }

  function open(config = {}){
    ensureOverlay();
    render(config);
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
  }

  function close(){
    if(!overlayEl) return;
    if(!overlayEl.hasAttribute('hidden')){
      overlayEl.setAttribute('hidden', '');
    }
    document.body.classList.remove('lesson-simulator-open');
    if(keyHandlerBound){
      document.removeEventListener('keydown', onKeydown);
      keyHandlerBound = false;
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
  const fallbackLessonsCache = {
    promise: null,
    sections: []
  };
  let documentClickHandler = null;

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

  function ensureFallbackLessons(){
    if(fallbackLessonsCache.sections.length) return Promise.resolve(fallbackLessonsCache.sections);
    if(fallbackLessonsCache.promise) return fallbackLessonsCache.promise;
    const load = (async () => {
      const collected = [];
      for(let index = 1; index <= 50; index += 1){
        const slug = `section-${index}`;
        const path = `assets/sections/${slug}/units.json`;
        try{
          const res = await fetch(path, { cache: 'no-cache' });
          if(!res.ok){
            break;
          }
          const data = await res.json();
          if(data){
            collected.push(data);
          }
        }catch(err){
          console.warn('debug: failed to load lesson data for simulator', err);
          break;
        }
      }
      fallbackLessonsCache.sections = collected;
      fallbackLessonsCache.promise = null;
      return collected;
    })();
    fallbackLessonsCache.promise = load;
    return load;
  }

  function populateLessons(){
    if(!simulatorState.lessonSelect) return;
    const select = simulatorState.lessonSelect;
    const learn = window.__LEARN__;
    select.disabled = true;
    select.innerHTML = '<option value="">Loading…</option>';
    lessonOptionMap.clear();
    updateStartButtonState();
    const buildOptions = sections => {
      const options = [];
      sections.forEach((section, sectionIndex) => {
        const sectionNumber = section.number || sectionIndex + 1;
        const sectionTitle = section.title || (sectionNumber ? `Section ${sectionNumber}` : 'Section');
        const units = Array.isArray(section.units) ? section.units : [];
        units.forEach((unit, unitIndex) => {
          const unitId = unit.id || '';
          const unitTitle = unit.title || `Unit ${unitIndex + 1}`;
          const unitNumber = unit.number || unitIndex + 1;
          const lessons = Array.isArray(unit.lessons) ? unit.lessons : [];
          lessons.forEach((lesson, index) => {
            const lessonId = lesson && lesson.id ? lesson.id : '';
            if(!lessonId) return;
            const key = [sectionNumber, unitId, lessonId, lesson.skillId || '', lesson.levelId || ''].join('|');
            const lessonTitle = lesson.title || `Lesson ${index + 1}`;
            const textParts = [
              sectionNumber ? `Section ${sectionNumber}` : sectionTitle,
              unitTitle,
              lessonTitle
            ].filter(Boolean);
            lessonOptionMap.set(key, {
              sectionNumber,
              sectionTitle,
              unitId,
              unitNumber,
              unitTitle,
              lessonId,
              lessonTitle,
              lessonIndex: index + 1,
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

    if(learn && typeof learn.ensureSections === 'function'){
      learn.ensureSections().then(() => {
        const snapshot = typeof learn.getSectionsSnapshot === 'function' ? learn.getSectionsSnapshot() : [];
        buildOptions(snapshot);
      }).catch(() => {
        ensureFallbackLessons().then(buildOptions).catch(() => {
          select.innerHTML = '<option value="">Failed to load lessons</option>';
          select.disabled = true;
          updateStartButtonState();
        });
      });
      return;
    }

    ensureFallbackLessons().then(buildOptions).catch(() => {
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
