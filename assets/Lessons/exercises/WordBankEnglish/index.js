import {
  ensureStylesheet,
  normaliseAnswer,
  normaliseText,
  setStatusMessage,
  shuffle,
} from '../_shared/utils.js';
import {
  fetchLessonVocab,
  fetchAllLessonVocabsUpTo,
  loadLessonSource,
} from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank-english"]';
const STYLESHEET_ID = 'word-bank-english-styles';
const MAX_DISTRACTOR_COUNT = 6;

function tokenizeSentence(sentence) {
  if (!sentence) return [];
  return sentence
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function parseLessonNumber(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = value.toString().match(/lesson[-_\s]?(\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveLessonNumber(context = {}) {
  const meta = context.meta || {};
  const detail = context.detail || {};
  return (
    parseLessonNumber(meta.lessonNumber) ||
    parseLessonNumber(detail.lessonNumber) ||
    parseLessonNumber(meta.lessonId) ||
    parseLessonNumber(detail.lessonId) ||
    parseLessonNumber(detail.lessonPath)
  );
}

function parseAnswersFromValue(value) {
  const answers = [];

  const addAnswer = (candidate) => {
    const text = normaliseText(candidate);
    if (text) answers.push(text);
  };

  const process = (candidate) => {
    if (candidate === null || candidate === undefined) return;
    if (Array.isArray(candidate)) {
      candidate.forEach(process);
      return;
    }
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) return;
      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
        (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        try {
          const parsed = JSON.parse(trimmed);
          process(parsed);
          return;
        } catch (error) {
          // Ignore JSON parsing issues and fall back to split handling.
        }
      }
      trimmed
        .split(/\s*\|\s*|\s*\/\s*|\s*;\s*/)
        .filter(Boolean)
        .forEach(addAnswer);
      return;
    }
    if (typeof candidate === 'object') {
      Object.values(candidate).forEach(process);
      return;
    }
    addAnswer(candidate);
  };

  process(value);
  return Array.from(new Set(answers));
}

function buildBasePrompt(entry = {}) {
  const prompt = normaliseText(
    entry.prompt || entry.title || entry.question || entry.label || 'Build the English sentence'
  );
  const instructions = normaliseText(
    entry.instructions ||
      entry.instruction ||
      entry.subtitle ||
      'Tap the tiles to build the sentence in English.'
  );
  const placeholder = normaliseText(
    entry.placeholder || entry.placeholderText || 'Tap a tile to add it to your answer.'
  );
  const successMessage = normaliseText(
    entry.successMessage || entry.success || 'Correct! Great job building the English sentence.'
  );
  const errorMessage = normaliseText(
    entry.errorMessage || entry.error || 'Not quite, try again.'
  );
  const initialMessage = normaliseText(
    entry.initialMessage || entry.initial || 'Tap tiles to build the English sentence.'
  );

  return {
    prompt: prompt || 'Build the English sentence',
    instructions:
      instructions || 'Tap the tiles to build the sentence in English.',
    placeholder: placeholder || 'Tap a tile to add it to your answer.',
    successMessage:
      successMessage || 'Correct! Great job building the English sentence.',
    errorMessage: errorMessage || 'Not quite, try again.',
    initialMessage:
      initialMessage || 'Tap tiles to build the English sentence.',
  };
}

function normalisePromptEntry(entry, typeKey) {
  if (!entry || typeof entry !== 'object') return null;
  const entryType = normaliseText(entry.type || entry.variant || '').toLowerCase();
  if (typeKey) {
    if (!entryType) return null;
    if (entryType !== typeKey) return null;
  }

  const answers = parseAnswersFromValue(
    entry.answers ||
      entry.answer ||
      entry.accept ||
      entry.correct ||
      entry.solution ||
      entry.expected ||
      entry.text
  );
  if (!answers.length) return null;

  const base = buildBasePrompt(entry);
  return {
    ...base,
    answers,
    type: typeKey,
  };
}

function normalisePromptList(rawValue, typeKey) {
  const list = Array.isArray(rawValue) ? rawValue : rawValue ? [rawValue] : [];
  return list
    .map((entry) => normalisePromptEntry(entry, typeKey))
    .filter((item) => item && Array.isArray(item.answers) && item.answers.length);
}

async function fetchWordBankPromptsByType(typeKey) {
  if (typeof window === 'undefined') {
    throw new Error('WordBankEnglish requires a browser environment.');
  }

  const context = window.BashaLanka?.currentLesson || {};
  const detail = context.detail || {};

  const candidateSources = [
    detail._wordBankPrompts,
    detail.wordBankPrompts,
    detail.wordBank,
    detail.wordbank,
  ];
  for (const source of candidateSources) {
    const prompts = normalisePromptList(source, typeKey);
    if (prompts.length) {
      return prompts;
    }
  }

  let lessonPath = detail.lessonPath;
  if (!lessonPath) {
    const lessonNumber = resolveLessonNumber(context);
    if (lessonNumber) {
      lessonPath = `assets/Lessons/lesson-${String(lessonNumber).padStart(2, '0')}.md`;
    }
  }

  if (!lessonPath) {
    throw new Error('Lesson markdown path unavailable for WordBankEnglish exercise.');
  }

  const lesson = await loadLessonSource(lessonPath);
  const rawPrompts = lesson.wordBankPrompts || lesson.wordBank || lesson.wordbank;
  const prompts = normalisePromptList(rawPrompts, typeKey);
  if (!prompts.length) {
    throw new Error('Lesson markdown is missing English word bank prompts.');
  }
  if (!detail.lessonPath) {
    detail.lessonPath = lesson.path;
  }
  detail._wordBankPrompts = rawPrompts;
  return prompts;
}

function collectEnglishDistractors(vocabEntries, baseSet) {
  const seen = new Set();
  const words = [];
  (Array.isArray(vocabEntries) ? vocabEntries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const en = normaliseText(entry.en || entry.english || '');
    if (!en) return;
    tokenizeSentence(en).forEach((token) => {
      const key = token.toLowerCase();
      if (!token || baseSet.has(key) || seen.has(key)) return;
      seen.add(key);
      words.push(token);
    });
  });
  return words;
}

function buildTileData(entry, options = {}) {
  const answers = Array.isArray(entry.answers) ? entry.answers : [];
  const canonical = answers[0];
  const tokens = tokenizeSentence(canonical);
  if (!tokens.length) {
    throw new Error('WordBankEnglish answer must include at least one word.');
  }

  const baseSet = new Set(tokens.map((token) => token.toLowerCase()));
  const baseTiles = tokens.map((token, index) => ({
    id: `${index}-${Math.random().toString(36).slice(2, 8)}`,
    value: token,
    isAnswer: true,
  }));

  const distractorPool = collectEnglishDistractors(options.distractorSource || [], baseSet);
  const extra = shuffle(distractorPool).slice(0, MAX_DISTRACTOR_COUNT);
  const distractorTiles = extra.map((value, index) => ({
    id: `d-${index}-${Math.random().toString(36).slice(2, 8)}`,
    value,
    isAnswer: false,
  }));

  return shuffle([...baseTiles, ...distractorTiles]);
}

function createEnglishTile({ value }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank-english__tile';
  button.dataset.tileValue = value;
  button.textContent = value;
  return button;
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank-english';

  const surface = document.createElement('div');
  surface.className = 'word-bank-english__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('div');
  header.className = 'word-bank-english__header';
  surface.appendChild(header);

  const hero = document.createElement('div');
  hero.className = 'word-bank-english__hero';
  header.appendChild(hero);

  const lessonContext = window.BashaLanka?.currentLesson || {};
  const lessonDetail = lessonContext.detail || {};
  const lessonMeta = lessonContext.meta || {};
  let mascotSrc = lessonDetail.mascot;
  if (!mascotSrc && lessonMeta.sectionNumber) {
    mascotSrc = `assets/sections/section-${lessonMeta.sectionNumber}/mascot.svg`;
  }
  if (!mascotSrc) {
    mascotSrc = 'assets/sections/section-1/mascot.svg';
  }
  const mascot = document.createElement('img');
  mascot.className = 'word-bank-english__mascot';
  mascot.src = mascotSrc;
  mascot.alt = 'Lesson mascot';
  hero.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank-english__bubble';
  hero.appendChild(bubble);

  const prompt = document.createElement('p');
  prompt.className = 'word-bank-english__prompt';
  prompt.textContent = config.prompt;
  bubble.appendChild(prompt);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank-english__assembled';
  bubble.appendChild(assembled);

  const placeholder = document.createElement('span');
  placeholder.className = 'word-bank-english__placeholder';
  placeholder.textContent = config.placeholder;
  assembled.appendChild(placeholder);

  const instructions = document.createElement('p');
  instructions.className = 'word-bank-english__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  const bank = document.createElement('div');
  bank.className = 'word-bank-english__bank';
  surface.appendChild(bank);

  const controls = document.createElement('div');
  controls.className = 'word-bank-english__controls';
  surface.appendChild(controls);

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'word-bank-english__button word-bank-english__button--check';
  check.textContent = 'Check';
  controls.appendChild(check);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'word-bank-english__button word-bank-english__button--reset';
  reset.textContent = 'Reset';
  controls.appendChild(reset);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank-english__feedback';
  feedback.setAttribute('data-status', 'neutral');
  surface.appendChild(feedback);

  return {
    wrapper,
    assembled,
    placeholder,
    bank,
    check,
    reset,
    feedback,
  };
}

function updatePlaceholder(state) {
  const hasTiles = state.assembled.querySelector('[data-tile-value]');
  state.placeholder.hidden = Boolean(hasTiles);
  state.assembled.classList.toggle('word-bank-english__assembled--filled', Boolean(hasTiles));
  state.assembled.classList.remove('word-bank-english__assembled--error');
}

function moveTile(state, tile) {
  if (state.completed) return;
  const parent = tile.parentElement;
  if (parent === state.bank) {
    state.assembled.appendChild(tile);
    tile.classList.add('word-bank-english__tile--selected');
  } else {
    state.bank.appendChild(tile);
    tile.classList.remove('word-bank-english__tile--selected');
  }
  updatePlaceholder(state);
}

function renderTiles(state) {
  state.bank.innerHTML = '';
  state.tiles.forEach((tile) => {
    tile.element.addEventListener('click', () => moveTile(state, tile.element));
  });
  shuffle(state.tiles.slice()).forEach((tile) => {
    state.bank.appendChild(tile.element);
  });
  updatePlaceholder(state);
}

function getSelection(state) {
  return Array.from(state.assembled.querySelectorAll('[data-tile-value]')).map(
    (tile) => tile.dataset.tileValue || tile.textContent || ''
  );
}

function resetState(state) {
  state.completed = false;
  state.tiles.forEach((tile) => {
    tile.element.disabled = false;
    tile.element.classList.remove(
      'word-bank-english__tile--selected',
      'word-bank-english__tile--locked'
    );
    state.bank.appendChild(tile.element);
  });
  state.assembled.classList.remove(
    'word-bank-english__assembled--correct',
    'word-bank-english__assembled--error'
  );
  state.check.disabled = false;
  state.reset.disabled = false;
  updatePlaceholder(state);
}

function lockState(state) {
  state.completed = true;
  state.tiles.forEach((tile) => {
    tile.element.disabled = true;
    tile.element.classList.add('word-bank-english__tile--locked');
  });
  state.check.disabled = true;
  state.reset.disabled = true;
  state.assembled.classList.add('word-bank-english__assembled--correct');
}

async function prepareConfig() {
  const context = window.BashaLanka?.currentLesson || {};
  const lessonNumber = resolveLessonNumber(context) || 1;
  const currentVocab = await fetchLessonVocab();
  const previousLessonCount = Math.max(lessonNumber - 1, 0);
  const previousVocabs = previousLessonCount
    ? await fetchAllLessonVocabsUpTo(previousLessonCount)
    : [];
  const prompts = await fetchWordBankPromptsByType('english');
  if (!prompts.length) {
    throw new Error('No English word bank prompts available for this lesson.');
  }
  const entry = prompts.length === 1 ? prompts[0] : prompts[Math.floor(Math.random() * prompts.length)];
  const tiles = buildTileData(entry, {
    distractorSource: previousVocabs.length ? previousVocabs : currentVocab,
  });
  return { ...entry, tiles };
}

export async function initWordBankEnglish(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankEnglish requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('WordBankEnglish target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  let config;
  if (configOverride && typeof configOverride === 'object') {
    const entry = normalisePromptEntry(configOverride, 'english');
    if (!entry) {
      throw new Error('Invalid WordBankEnglish config override supplied.');
    }
    const tiles = buildTileData(entry, {
      distractorSource: configOverride.distractors || configOverride.distractorWords || [],
    });
    config = { ...entry, tiles };
  } else {
    config = await prepareConfig();
  }

  const layout = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(layout.wrapper);

  const tiles = config.tiles.map((tileData) => ({
    ...tileData,
    element: createEnglishTile(tileData),
  }));

  const state = {
    config,
    tiles,
    assembled: layout.assembled,
    placeholder: layout.placeholder,
    bank: layout.bank,
    check: layout.check,
    reset: layout.reset,
    feedback: layout.feedback,
    completed: false,
    answers: config.answers.map((answer) => normaliseAnswer(answer)),
  };

  renderTiles(state);
  setStatusMessage(state.feedback, config.initialMessage, 'neutral');

  layout.check.addEventListener('click', () => {
    if (state.completed) return;
    const selection = getSelection(state);
    const attempt = normaliseAnswer(selection.join(' '));
    if (!attempt) {
      state.assembled.classList.add('word-bank-english__assembled--error');
      setStatusMessage(state.feedback, 'Select tiles to build your answer first.', 'neutral');
      return;
    }
    if (state.answers.includes(attempt)) {
      lockState(state);
      setStatusMessage(state.feedback, config.successMessage, 'success');
      if (typeof onComplete === 'function') {
        onComplete({ value: selection.slice() });
      }
    } else {
      state.assembled.classList.add('word-bank-english__assembled--error');
      setStatusMessage(state.feedback, config.errorMessage, 'error');
    }
  });

  layout.reset.addEventListener('click', () => {
    if (state.completed) return;
    resetState(state);
    setStatusMessage(state.feedback, config.initialMessage, 'neutral');
  });

  return state;
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBankEnglish = initWordBankEnglish;
}

export default initWordBankEnglish;
