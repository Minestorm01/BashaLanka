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

  const EXERCISE_TYPES = (() => {
    const toInlineJSON = (value) => JSON.stringify(value, null, 2);
    return [
      {
        value: 'TranslateToBase',
        label: 'Translate → English',
        loader: () => import('./assets/Lessions/exercises/TranslateToBase/index.js'),
        samplePath: './assets/Lessions/exercises/TranslateToBase/config.json',
        inlineExample: toInlineJSON({
          id: 'translate-to-base-1',
          badge: 'NEW WORD',
          prompt: 'මම',
          transliteration: 'mama',
          choices: [
            { label: 'I' },
            { label: 'You' },
            { label: 'We' },
            { label: 'They' },
          ],
          answers: ['I'],
          instructions: 'Select the English meaning that matches the Sinhala word.',
          successMessage: "Correct! 'මම' means 'I'.",
          errorMessage: 'Not quite, try again.',
          initialMessage: 'Tap the correct English meaning from the list.',
        }),
        normalise: normaliseTranslateToBaseConfig,
      },
      {
        value: 'TranslateToTarget',
        label: 'Translate → Sinhala',
        loader: () => import('./assets/Lessions/exercises/TranslateToTarget/index.js'),
        samplePath: './assets/Lessions/exercises/TranslateToTarget/config.json',
        inlineExample: toInlineJSON({
          id: 'translate-to-target-1',
          mode: 'multiple-choice',
          badge: 'TRANSLATE',
          prompt: 'Translate to Sinhala',
          source: 'The girl drinks tea.',
          choices: [
            'ගැහැණු ළමයා තේ බොයි.',
            'ගැහැනු ළමයා කන්න යයි.',
            'බාලයා නින්ද යයි.',
            'අයියා පාඩම් කරයි.',
          ],
          answers: ['ගැහැණු ළමයා තේ බොයි.'],
          instructions: 'Tap the Sinhala translation that matches the English sentence.',
          successMessage: 'Great! You chose the correct Sinhala translation.',
          errorMessage: 'Not quite. Try another option.',
          initialMessage: 'Focus on the verb and subject order when you translate.',
        }),
        normalise: normaliseTranslateToTargetConfig,
      },
      {
        value: 'WordBank',
        label: 'Word Bank',
        loader: () => import('./assets/Lessions/exercises/WordBank/index.js'),
        samplePath: './assets/Lessions/exercises/WordBank/config.json',
        inlineExample: toInlineJSON({
          id: 'word-bank-1',
          prompt: 'Build the sentence in Sinhala',
          instructions: 'Tap the tiles to build the sentence in the correct order.',
          wordBank: ['මම', 'ටී', 'බොමි', 'ඒක', 'දින'],
          answers: ['මම ටී බොමි'],
          successMessage: 'Great work! You built the sentence correctly.',
          errorMessage: 'Check the word order and try again.',
          initialMessage: 'Hint: Sinhala sentences often end with the verb.',
        }),
      },
      {
        value: 'MatchPairs',
        label: 'Match Pairs',
        loader: () => import('./assets/Lessions/exercises/MatchPairs/index.js'),
        samplePath: './assets/Lessions/exercises/MatchPairs/config.json',
        inlineExample: toInlineJSON({
          id: 'match-pairs-1',
          prompt: 'Match the Sinhala words to their English meanings',
          instructions: 'Tap two cards to see if they match.',
          pairs: [
            { base: 'water', target: 'ජලය' },
            { base: 'bread', target: 'පන්' },
            { base: 'girl', target: 'ගැහැණු ළමයා' },
            { base: 'school', target: 'පාසල' },
          ],
          successMessage: 'Nice! Keep matching the pairs.',
          errorMessage: "Those don't match yet.",
          initialMessage: 'Remember each pair contains one English and one Sinhala word.',
        }),
      },
      {
        value: 'FillBlank',
        label: 'Fill in the Blank',
        loader: () => import('./assets/Lessions/exercises/FillBlank/index.js'),
        samplePath: './assets/Lessions/exercises/FillBlank/config.json',
        inlineExample: toInlineJSON({
          id: 'fill-blank-1',
          prompt: 'Fill in the missing word',
          instructions: 'Choose the word that best completes the sentence.',
          sentence: {
            before: 'මම',
            after: 'යමි',
          },
          choices: ['පාසලට', 'වතුර', 'කිරි'],
          answers: ['පාසලට'],
          blankPlaceholder: '_____',
          successMessage: "Nice! The sentence means ‘I go to school’.",
          errorMessage: 'Try another option.',
          initialMessage: 'Remember Sinhala uses postpositions after nouns.',
        }),
      },
      {
        value: 'Dialogue',
        label: 'Dialogue',
        loader: () => import('./assets/Lessions/exercises/Dialogue/index.js'),
        samplePath: './assets/Lessions/exercises/Dialogue/config.json',
        inlineExample: toInlineJSON({
          id: 'dialogue-1',
          prompt: 'Practice a morning greeting',
          instructions: 'Follow the conversation and choose the best reply.',
          initialMessage: 'Respond in Sinhala to keep the dialogue flowing.',
          turnSuccessMessage: 'Nice answer!',
          turnErrorMessage: 'Try a different reply.',
          successMessage: 'You completed the dialogue!',
          turns: [
            {
              type: 'statement',
              role: 'tutor',
              speaker: 'Friend',
              text: 'සුභ උදෑසනක්!',
              delay: 300,
            },
            {
              type: 'choice',
              answers: ['සුභ උදෑසනක්'],
              options: [
                { label: 'සුභ උදෑසනක්' },
                {
                  label: 'සුභ රාත්‍රියක්',
                  followUp: {
                    text: 'අද උදේයි, නැවත උත්සාහ කරන්න!',
                    role: 'tutor',
                    speaker: 'Friend',
                  },
                },
                {
                  label: 'ඔබට කොහොම ද?',
                  followUp: {
                    text: 'උදේදී සාදරයෙන් සුභ පැතීම හොඳයි!',
                    role: 'tutor',
                    speaker: 'Friend',
                  },
                },
              ],
              delay: 400,
            },
            {
              type: 'statement',
              role: 'tutor',
              speaker: 'Friend',
              text: 'ඔබට කොහොම ද?',
              delay: 300,
            },
            {
              type: 'choice',
              answers: ['මම හොඳින්'],
              options: [
                { label: 'මම හොඳින්' },
                { label: 'මට යන්න ඕන' },
              ],
              delay: 400,
            },
            {
              type: 'statement',
              role: 'tutor',
              speaker: 'Friend',
              text: 'ඒක සතුටක්!',
            },
          ],
        }),
      },
      {
        value: 'Listening',
        label: 'Listening',
        loader: () => import('./assets/Lessions/exercises/Listening/index.js'),
        samplePath: './assets/Lessions/exercises/Listening/config.json',
        inlineExample: toInlineJSON({
          id: 'listening-1',
          prompt: 'Listen and choose the correct translation',
          instructions: 'Tap play and choose what you hear in Sinhala.',
          audioSrc: '/es_man.mp3',
          choices: ['හෙලෝ', 'ආයුබෝවන්', 'සුභ සන්ධ්‍යා වෙලාවක්'],
          answers: ['ආයුබෝවන්'],
          successMessage: 'Great ear! You picked the correct phrase.',
          errorMessage: 'Listen again and try another option.',
          initialMessage: 'You can replay the audio as many times as you like.',
        }),
      },
      {
        value: 'PictureChoice',
        label: 'Picture Choice',
        loader: () => import('./assets/Lessions/exercises/PictureChoice/index.js'),
        samplePath: './assets/Lessions/exercises/PictureChoice/config.json',
        inlineExample: toInlineJSON({
          id: 'picture-choice-1',
          prompt: 'Which one is ‘බල්ලා’?'
          instructions: 'Tap the picture that matches the Sinhala word.',
          choices: [
            {
              label: 'Dog',
              value: 'dog',
              image: '/dog.svg',
              alt: 'Illustration of a happy dog',
            },
            {
              label: 'Cat',
              value: 'cat',
              image: '/girl.svg',
              alt: 'Illustration of a smiling girl',
            },
            {
              label: 'Bird',
              value: 'bird',
              image: '/robot.svg',
              alt: 'Illustration of a friendly robot',
            },
          ],
          answers: ['dog'],
          successMessage: "Correct! ‘බල්ලා’ means dog.",
          errorMessage: 'Try another picture.',
          initialMessage: 'Look for the animal that matches the Sinhala word.',
        }),
      },
      {
        value: 'Speak',
        label: 'Speak',
        loader: () => import('./assets/Lessions/exercises/Speak/index.js'),
        samplePath: './assets/Lessions/exercises/Speak/config.json',
        inlineExample: toInlineJSON({
          id: 'speak-1',
          prompt: 'Say “සුභ උදෑසනක්”',
          transliteration: 'subha udǣsanak',
          instructions: 'Tap start and say the phrase clearly into your microphone.',
          answers: ['සුභ උදෑසනක්'],
          lang: 'si-LK',
          successMessage: 'Beautiful pronunciation!',
          errorMessage: "We didn't catch the phrase. Try again.",
          initialMessage: 'Allow microphone access if prompted.',
          listeningMessage: 'Listening…',
          retryLabel: 'Try again',
        }),
      },
    ];
  })();

  const EXERCISE_DEFINITIONS = EXERCISE_TYPES.reduce((acc, entry) => {
    acc[entry.value] = entry;
    return acc;
  }, {});

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

  function isTranslateToTargetConfig(candidate) {
    if (!candidate || typeof candidate !== 'object') return false;
    if (!candidate.prompt || !String(candidate.prompt).trim().length) return false;
    if (!Array.isArray(candidate.choices) || candidate.choices.length === 0) return false;
    return true;
  }

  function normaliseTranslateToTargetChoices(choices) {
    if (!Array.isArray(choices)) return [];
    return choices
      .map((choice) => {
        if (choice === null || choice === undefined) {
          return null;
        }

        if (typeof choice === 'string' || typeof choice === 'number') {
          return { label: String(choice), transliteration: '', isCorrect: false };
        }

        if (typeof choice !== 'object') {
          return null;
        }

        const next = { ...choice };

        if (next.label === undefined && next.si !== undefined) {
          next.label = String(next.si);
        }

        if (next.label === undefined && next.value !== undefined) {
          next.label = String(next.value);
        }

        if (next.transliteration === undefined && next.translit !== undefined) {
          next.transliteration = String(next.translit);
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
          transliteration: next.transliteration ? String(next.transliteration) : '',
          isCorrect: Boolean(next.isCorrect),
        };
      })
      .filter((choice) => choice && choice.label);
  }

  function normaliseTranslateToTargetConfig(config) {
    if (!isTranslateToTargetConfig(config)) {
      return null;
    }

    const { choices = [], ...rest } = config;
    const normalisedChoices = normaliseTranslateToTargetChoices(choices);
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
            <select id="debugExerciseType" class="select"></select>
          </div>
          <div class="field">
            <label class="label" for="debugLessonPath">Lesson data path</label>
            <input id="debugLessonPath" class="input" type="text" placeholder="./assets/Lessions/.../lesson-01.md" autocomplete="off" />
            <p class="help" data-lesson-help>Enter a site-relative path to a JSON config such as <code>./assets/Lessions/exercises/TranslateToBase/config.json</code> or a Markdown lesson like <code>./assets/Lessions/section-1/lesson-01.md</code>.</p>
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
    const lessonHelp = container.querySelector('[data-lesson-help]');

    if (typeSelect) {
      typeSelect.innerHTML = EXERCISE_TYPES.map(({ value, label }) =>
        `<option value="${value}">${escapeHTML(label)}</option>`
      ).join('');
      if (!typeSelect.value && EXERCISE_TYPES.length) {
        typeSelect.value = EXERCISE_TYPES[0].value;
      }
    }

    const EXERCISE_MODULE_LOADERS = EXERCISE_TYPES.reduce((acc, entry) => {
      if (entry && entry.value && typeof entry.loader === 'function') {
        acc[entry.value] = entry.loader;
      }
      return acc;
    }, {});

    const exerciseModulePromises = {};

    const getCurrentDefinition = () => {
      const type = typeSelect?.value;
      return type ? EXERCISE_DEFINITIONS[type] : null;
    };

    function syncInlineConfigValue() {
      if (!inlineConfigInput || !typeSelect) return;
      const def = getCurrentDefinition();
      inlineConfigInput.value = def?.inlineExample || '';
    }

    function syncLessonPathInfo() {
      if (!lessonPathInput) return;
      const def = getCurrentDefinition();
      const samplePath = def?.samplePath || './assets/Lessions/exercises/TranslateToBase/config.json';
      lessonPathInput.placeholder = samplePath;
      const shouldAutofill = !lessonPathInput.value || lessonPathInput.dataset.autofilled !== 'false';
      if (shouldAutofill) {
        lessonPathInput.value = samplePath;
        lessonPathInput.dataset.autofilled = 'true';
      }
      if (lessonHelp) {
        const markdownExample = './assets/Lessions/section-1/lesson-01.md';
        lessonHelp.innerHTML = `Enter a site-relative path to a JSON config such as <code>${escapeHTML(samplePath)}</code> or a Markdown lesson like <code>${escapeHTML(markdownExample)}</code>.`;
      }
    }

    const handleTypeChange = () => {
      syncInlineConfigValue();
      syncLessonPathInfo();
      syncInlineVisibility();
    };

    if (inlineConfigInput) {
      syncInlineConfigValue();
    }

    const handleLessonPathInput = () => {
      if (!lessonPathInput) return;
      lessonPathInput.dataset.autofilled = lessonPathInput.value ? 'false' : 'true';
    };

    if (lessonPathInput) {
      syncLessonPathInfo();
      lessonPathInput.addEventListener('input', handleLessonPathInput);
    }

    function syncInlineVisibility() {
      if (!inlineToggle || !inlineConfigWrap || !lessonPathInput) return;
      const useInline = inlineToggle.checked;
      inlineConfigWrap.hidden = !useInline;
      lessonPathInput.disabled = useInline;
    }

    function normaliseConfigForType(type, config) {
      if (!config) return null;
      const def = type ? EXERCISE_DEFINITIONS[type] : null;
      if (def && typeof def.normalise === 'function') {
        return def.normalise(config);
      }
      return config;
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
      const definition = getCurrentDefinition();
      if (!type || !definition) {
        preview.innerHTML = '<p class="debug-tester__error">Select an exercise type to run the tester.</p>';
        return;
      }
      preview.innerHTML = '<p>Loading exercise…</p>';

      let loader = window?.BashaLanka?.exercises?.[type];

      if (!loader) {
        const moduleLoader = EXERCISE_MODULE_LOADERS[type];
        if (!moduleLoader) {
          preview.innerHTML = `<p class="debug-tester__error">No loader registered for ${escapeHTML(type)} exercises.</p>`;
          return;
        }

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

    typeSelect?.addEventListener('change', handleTypeChange);
    inlineToggle?.addEventListener('change', syncInlineVisibility);
    runButton?.addEventListener('click', runTest);
    syncInlineVisibility();

    return () => {
      typeSelect?.removeEventListener('change', handleTypeChange);
      inlineToggle?.removeEventListener('change', syncInlineVisibility);
      runButton?.removeEventListener('click', runTest);
      lessonPathInput?.removeEventListener('input', handleLessonPathInput);
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
