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
  resolveLessonPathFromContext,
} from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank-sinhala"]';
const STYLESHEET_ID = 'word-bank-sinhala-styles';
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
          // Fall back to splitting below if JSON.parse fails.
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
    entry.prompt || entry.title || entry.question || entry.label || 'Build the Sinhala sentence'
  );
  const instructions = normaliseText(
    entry.instructions ||
      entry.instruction ||
      entry.subtitle ||
      'Tap the tiles to build the sentence in Sinhala.'
  );
  const placeholder = normaliseText(
    entry.placeholder || entry.placeholderText || 'Tap a tile to add it to your answer.'
  );
  const successMessage = normaliseText(
    entry.successMessage || entry.success || 'Correct! Great job building the Sinhala sentence.'
  );
  const errorMessage = normaliseText(
    entry.errorMessage || entry.error || 'Not quite, try again.'
  );
  const initialMessage = normaliseText(
    entry.initialMessage || entry.initial || 'Tap tiles to build the Sinhala sentence.'
  );

  return {
    prompt: prompt || 'Build the Sinhala sentence',
    instructions:
      instructions || 'Tap the tiles to build the sentence in Sinhala.',
    placeholder: placeholder || 'Tap a tile to add it to your answer.',
    successMessage:
      successMessage || 'Correct! Great job building the Sinhala sentence.',
    errorMessage: errorMessage || 'Not quite, try again.',
    initialMessage:
      initialMessage || 'Tap tiles to build the Sinhala sentence.',
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
    throw new Error('WordBankSinhala requires a browser environment.');
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
    lessonPath = await resolveLessonPathFromContext(context);
  }

  const lesson = await loadLessonSource(lessonPath);
  const rawPrompts = lesson.wordBankPrompts || lesson.wordBank || lesson.wordbank;
  const prompts = normalisePromptList(rawPrompts, typeKey);
  if (!prompts.length) {
    throw new Error('Lesson markdown is missing Sinhala word bank prompts.');
  }
  if (!detail.lessonPath) {
    detail.lessonPath = lesson.path;
  }
  detail._wordBankPrompts = rawPrompts;
  return prompts;
}

function buildTransliterationMap(vocabEntries) {
  const map = new Map();
  (Array.isArray(vocabEntries) ? vocabEntries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const si = normaliseText(entry.si || entry.sinhala || '');
    if (!si) return;
    const transliteration = normaliseText(entry.translit || entry.transliteration || '');
    const siTokens = tokenizeSentence(si);
    const translitTokens = tokenizeSentence(transliteration);
    if (siTokens.length && transliteration) {
      siTokens.forEach((token, index) => {
        if (!map.has(token)) {
          map.set(token, translitTokens[index] || transliteration);
        }
      });
    }
    if (transliteration && !map.has(si)) {
      map.set(si, transliteration);
    }
  });
  return map;
}

function getTransliterationForWord(word, map) {
  if (!word) return '';
  if (map.has(word)) return map.get(word);
  const stripped = word.replace(/["'“”‘’!?.,]+$/u, '');
  if (stripped && map.has(stripped)) return map.get(stripped);
  return '';
}

function collectSinhalaDistractors(vocabEntries, baseSet) {
  const seen = new Set();
  const distractors = [];
  (Array.isArray(vocabEntries) ? vocabEntries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const si = normaliseText(entry.si || entry.sinhala || '');
    if (!si) return;
    const transliteration = normaliseText(entry.translit || entry.transliteration || '');
    const tokens = tokenizeSentence(si);
    const translitTokens = tokenizeSentence(transliteration);
    tokens.forEach((token, index) => {
      const key = token.toLowerCase();
      if (!token || baseSet.has(key) || seen.has(key)) return;
      seen.add(key);
      distractors.push({
        value: token,
        transliteration: translitTokens[index] || transliteration || '',
      });
    });
  });
  return distractors;
}

function buildTileData(entry, options = {}) {
  const answers = Array.isArray(entry.answers) ? entry.answers : [];
  const canonical = answers[0];
  const tokens = tokenizeSentence(canonical);
  if (!tokens.length) {
    throw new Error('WordBankSinhala answer must include at least one word.');
  }

  const transliterationMap = buildTransliterationMap(options.transliterationSource || []);
  const baseSet = new Set(tokens.map((token) => token.toLowerCase()));
  const baseTiles = tokens.map((token, index) => ({
    id: `${index}-${Math.random().toString(36).slice(2, 8)}`,
    value: token,
    transliteration: getTransliterationForWord(token, transliterationMap),
    isAnswer: true,
  }));

  const distractorPool = collectSinhalaDistractors(options.distractorSource || [], baseSet);
  const extra = shuffle(distractorPool).slice(0, MAX_DISTRACTOR_COUNT);
  const distractorTiles = extra.map((item, index) => ({
    id: `d-${index}-${Math.random().toString(36).slice(2, 8)}`,
    value: item.value,
    transliteration: item.transliteration,
    isAnswer: false,
  }));

  return shuffle([...baseTiles, ...distractorTiles]);
}

function createSinhalaTile({ value, transliteration }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank-sinhala__tile';
  button.dataset.tileValue = value;

  const script = document.createElement('span');
  script.className = 'word-bank-sinhala__tile-script';
  script.textContent = value;
  button.appendChild(script);

  if (transliteration) {
    const helper = document.createElement('span');
    helper.className = 'word-bank-sinhala__tile-translit';
    helper.textContent = transliteration;
    button.appendChild(helper);
  }

  return button;
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank-sinhala';

  const surface = document.createElement('div');
  surface.className = 'word-bank-sinhala__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('div');
  header.className = 'word-bank-sinhala__header';
  surface.appendChild(header);

  const hero = document.createElement('div');
  hero.className = 'word-bank-sinhala__hero';
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
  mascot.className = 'word-bank-sinhala__mascot';
  mascot.src = mascotSrc;
  mascot.alt = 'Lesson mascot';
  hero.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank-sinhala__bubble';
  hero.appendChild(bubble);

  const prompt = document.createElement('p');
  prompt.className = 'word-bank-sinhala__prompt';
  prompt.textContent = config.prompt;
  bubble.appendChild(prompt);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank-sinhala__assembled';
  bubble.appendChild(assembled);

  const placeholder = document.createElement('span');
  placeholder.className = 'word-bank-sinhala__placeholder';
  placeholder.textContent = config.placeholder;
  assembled.appendChild(placeholder);

  const instructions = document.createElement('p');
  instructions.className = 'word-bank-sinhala__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  const bank = document.createElement('div');
  bank.className = 'word-bank-sinhala__bank';
  surface.appendChild(bank);

  const controls = document.createElement('div');
  controls.className = 'word-bank-sinhala__controls';
  surface.appendChild(controls);

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'word-bank-sinhala__button word-bank-sinhala__button--check';
  check.textContent = 'Check';
  controls.appendChild(check);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'word-bank-sinhala__button word-bank-sinhala__button--reset';
  reset.textContent = 'Reset';
  controls.appendChild(reset);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank-sinhala__feedback';
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
  state.assembled.classList.toggle('word-bank-sinhala__assembled--filled', Boolean(hasTiles));
  state.assembled.classList.remove('word-bank-sinhala__assembled--error');
}

function moveTile(state, tile) {
  if (state.completed) return;
  const parent = tile.parentElement;
  if (parent === state.bank) {
    state.assembled.appendChild(tile);
    tile.classList.add('word-bank-sinhala__tile--selected');
  } else {
    state.bank.appendChild(tile);
    tile.classList.remove('word-bank-sinhala__tile--selected');
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
      'word-bank-sinhala__tile--selected',
      'word-bank-sinhala__tile--locked'
    );
    state.bank.appendChild(tile.element);
  });
  state.assembled.classList.remove(
    'word-bank-sinhala__assembled--correct',
    'word-bank-sinhala__assembled--error'
  );
  state.check.disabled = false;
  state.reset.disabled = false;
  updatePlaceholder(state);
}

function lockState(state) {
  state.completed = true;
  state.tiles.forEach((tile) => {
    tile.element.disabled = true;
    tile.element.classList.add('word-bank-sinhala__tile--locked');
  });
  state.check.disabled = true;
  state.reset.disabled = true;
  state.assembled.classList.add('word-bank-sinhala__assembled--correct');
}

async function prepareConfig() {
  const context = window.BashaLanka?.currentLesson || {};
  const lessonNumber = resolveLessonNumber(context) || 1;
  const currentVocab = await fetchLessonVocab();
  const previousLessonCount = Math.max(lessonNumber - 1, 0);
  const previousVocabs = previousLessonCount
    ? await fetchAllLessonVocabsUpTo(previousLessonCount)
    : [];
  const prompts = await fetchWordBankPromptsByType('sinhala');
  if (!prompts.length) {
    throw new Error('No Sinhala word bank prompts available for this lesson.');
  }
  const entry = prompts.length === 1 ? prompts[0] : prompts[Math.floor(Math.random() * prompts.length)];
  const tiles = buildTileData(entry, {
    distractorSource: previousVocabs,
    transliterationSource: [...previousVocabs, ...currentVocab],
  });
  return { ...entry, tiles };
}

export async function initWordBankSinhala(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankSinhala requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('WordBankSinhala target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  let config;
  if (configOverride && typeof configOverride === 'object') {
    const entry = normalisePromptEntry(configOverride, 'sinhala');
    if (!entry) {
      throw new Error('Invalid WordBankSinhala config override supplied.');
    }
    const tiles = buildTileData(entry, {
      distractorSource: configOverride.distractors || configOverride.distractorWords || [],
      transliterationSource: configOverride.transliterationSource || [],
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
    element: createSinhalaTile(tileData),
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
      state.assembled.classList.add('word-bank-sinhala__assembled--error');
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
      state.assembled.classList.add('word-bank-sinhala__assembled--error');
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
  window.BashaLanka.exercises.WordBankSinhala = initWordBankSinhala;
}

export default initWordBankSinhala;
