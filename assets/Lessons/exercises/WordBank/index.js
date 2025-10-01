import {
  ensureStylesheet,
  normaliseAnswer,
  normaliseText,
  shuffle,
  setStatusMessage,
  createTile,
} from '../_shared/utils.js';
import { fetchLessonVocab, fetchAllLessonVocabsUpTo, loadLessonSource } from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank"]';
const STYLESHEET_ID = 'word-bank-styles';
const MIN_TILE_COUNT = 6;
const MAX_TILE_COUNT = 10;

function tokenizeSentence(sentence) {
  if (!sentence) return [];
  return sentence
    .toString()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildAnswerTileList(answers) {
  const counts = new Map();
  answers.forEach((answer) => {
    const tokens = tokenizeSentence(answer);
    const local = new Map();
    tokens.forEach((token) => {
      local.set(token, (local.get(token) || 0) + 1);
    });
    local.forEach((value, token) => {
      const current = counts.get(token) || 0;
      if (value > current) {
        counts.set(token, value);
      }
    });
  });

  const tiles = [];
  counts.forEach((count, token) => {
    for (let i = 0; i < count; i += 1) {
      tiles.push(token);
    }
  });
  return tiles;
}

function stripPunctuation(word) {
  if (!word) return '';
  return word
    .toString()
    .trim()
    .replace(/^[“”"'`]+/, '')
    .replace(/[.,!?;:"”'`]+$/g, '')
    .trim();
}

function collectDistractorWords(vocabEntries) {
  const unique = new Map();
  (Array.isArray(vocabEntries) ? vocabEntries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const english = normaliseText(entry.en || entry.english || '');
    if (!english) return;
    english
      .split(/\s+/)
      .map(stripPunctuation)
      .filter(Boolean)
      .forEach((word) => {
        const key = word.toLowerCase();
        if (!unique.has(key)) {
          unique.set(key, word);
        }
      });
  });
  return Array.from(unique.values());
}

function parseAnswersFromValue(value) {
  const answers = [];

  const add = (item) => {
    const text = normaliseText(item);
    if (text) {
      answers.push(text);
    }
  };

  const parseCandidate = (candidate) => {
    if (!candidate && candidate !== 0) return;
    if (Array.isArray(candidate)) {
      candidate.forEach(parseCandidate);
      return;
    }
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (!trimmed) return;
      if ((trimmed.startsWith('[') && trimmed.endsWith(']')) || (trimmed.startsWith('{') && trimmed.endsWith('}'))) {
        try {
          const parsed = JSON.parse(trimmed);
          parseCandidate(parsed);
          return;
        } catch (error) {
          // Fall back to splitting below if JSON.parse fails.
        }
      }
      trimmed
        .split(/\s*\|\s*|\s*\/\s*|\s*;\s*/)
        .filter(Boolean)
        .forEach(add);
      return;
    }
    if (typeof candidate === 'object') {
      Object.values(candidate || {}).forEach(parseCandidate);
      return;
    }
    add(candidate);
  };

  parseCandidate(value);
  return Array.from(new Set(answers));
}

function normaliseWordBankEntry(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    const answer = normaliseText(raw);
    if (!answer) return null;
    return {
      prompt: 'Build the sentence',
      instructions: 'Tap the words in the correct order.',
      placeholder: 'Tap the tiles to build the sentence.',
      answers: [answer],
    };
  }

  if (typeof raw !== 'object') return null;

  const answerSources = [
    raw.answers,
    raw.answer,
    raw.accept,
    raw.correct,
    raw.sentence,
    raw.sentences,
    raw.solution,
    raw.expected,
    raw.expectedAnswer,
    raw.target,
    raw.output,
    raw.text,
  ];

  const answers = answerSources.flatMap((candidate) => parseAnswersFromValue(candidate));

  if (!answers.length) return null;

  const prompt = normaliseText(
    raw.prompt || raw.title || raw.question || raw.label || raw.translation || 'Build the sentence'
  );
  const instructions = normaliseText(
    raw.instructions || raw.instruction || raw.subtitle || 'Tap the words in the correct order.'
  );
  const placeholder = normaliseText(
    raw.placeholder || raw.placeholderText || raw.helper || 'Tap the tiles to build the sentence.'
  );
  const hint = normaliseText(raw.hint || raw.translation || raw.clue || '');
  const successMessage = normaliseText(raw.successMessage || raw.success || 'Correct! Nice work.');
  const errorMessage = normaliseText(raw.errorMessage || raw.error || 'Not quite, try again.');
  const initialMessage = normaliseText(raw.initialMessage || raw.initial || 'Tap tiles to build the sentence.');

  return {
    prompt: prompt || 'Build the sentence',
    instructions: instructions || 'Tap the words in the correct order.',
    placeholder: placeholder || 'Tap the tiles to build the sentence.',
    hint,
    successMessage: successMessage || 'Correct! Nice work.',
    errorMessage: errorMessage || 'Not quite, try again.',
    initialMessage,
    answers,
  };
}

function normalisePromptList(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return list
    .map(normaliseWordBankEntry)
    .filter((entry) => entry && Array.isArray(entry.answers) && entry.answers.length);
}

function parseLessonNumber(value) {
  if (value === null || value === undefined) return null;
  const number = Number.parseInt(value, 10);
  if (Number.isFinite(number) && number > 0) return number;
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
    parseLessonNumber(detail.lessonId) ||
    parseLessonNumber(detail.lessonPath)
  );
}

async function fetchWordBankPrompts() {
  if (typeof window === 'undefined') {
    throw new Error('WordBank requires a browser environment.');
  }

  const context = window.BashaLanka?.currentLesson || {};
  const detail = context.detail || {};

  const candidateSources = [detail.wordBankPrompts, detail.wordBank, detail.wordbank];
  for (const source of candidateSources) {
    const prompts = normalisePromptList(source);
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
    throw new Error('Lesson markdown path unavailable for WordBank exercise.');
  }

  const lesson = await loadLessonSource(lessonPath);
  const prompts = normalisePromptList(lesson.wordBankPrompts || lesson.wordbank || lesson.wordBank);
  if (!prompts.length) {
    throw new Error('Lesson markdown is missing WordBank prompts.');
  }
  if (!detail.lessonPath) {
    detail.lessonPath = lesson.path;
  }
  detail.wordBankPrompts = prompts;
  return prompts;
}

function buildWordBankConfig(entry, options = {}) {
  if (!entry || !Array.isArray(entry.answers) || !entry.answers.length) {
    throw new Error('WordBank entry requires at least one answer.');
  }

  const baseTiles = buildAnswerTileList(entry.answers);
  if (!baseTiles.length) {
    throw new Error('WordBank answers must include at least one word.');
  }
  const baseSet = new Set(baseTiles.map((word) => word.toLowerCase()));
  const distractorWords = Array.isArray(options.distractorWords) ? options.distractorWords : [];
  const shuffledDistractors = shuffle(distractorWords).filter((word) => {
    if (!word) return false;
    const key = word.toLowerCase();
    if (baseSet.has(key)) return false;
    baseSet.add(key);
    return true;
  });

  const words = baseTiles.slice();
  const minTarget = baseTiles.length > MAX_TILE_COUNT ? baseTiles.length : Math.max(MIN_TILE_COUNT, baseTiles.length);
  for (const word of shuffledDistractors) {
    if (words.length >= minTarget) break;
    if (words.length >= MAX_TILE_COUNT && baseTiles.length <= MAX_TILE_COUNT) break;
    words.push(word);
  }

  return {
    prompt: entry.prompt,
    instructions: entry.instructions,
    placeholder: entry.placeholder,
    hint: entry.hint,
    successMessage: entry.successMessage,
    errorMessage: entry.errorMessage,
    initialMessage: entry.initialMessage,
    answers: entry.answers,
    wordBank: words,
  };
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank';

  const surface = document.createElement('div');
  surface.className = 'word-bank__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'word-bank__header';
  surface.appendChild(header);

  const title = document.createElement('h2');
  title.className = 'word-bank__title';
  title.textContent = config.prompt || 'Build the sentence';
  header.appendChild(title);

  const hero = document.createElement('div');
  hero.className = 'word-bank__hero';
  surface.appendChild(hero);

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
  mascot.className = 'word-bank__mascot';
  mascot.src = mascotSrc;
  mascot.alt = 'Lesson mascot';
  hero.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank__bubble';
  hero.appendChild(bubble);

  const bubbleLabel = document.createElement('p');
  bubbleLabel.className = 'word-bank__bubble-label';
  bubbleLabel.textContent = 'Assemble the sentence';
  bubble.appendChild(bubbleLabel);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  assembled.setAttribute('role', 'list');
  bubble.appendChild(assembled);

  const placeholder = document.createElement('span');
  placeholder.className = 'word-bank__assembled-placeholder';
  placeholder.textContent = config.placeholder || 'Tap the tiles to build the sentence.';
  assembled.appendChild(placeholder);

  const instructions = document.createElement('p');
  instructions.className = 'word-bank__instructions';
  instructions.textContent = config.instructions || 'Tap the words in the correct order.';
  surface.appendChild(instructions);

  if (config.hint) {
    const hint = document.createElement('p');
    hint.className = 'word-bank__hint';
    hint.textContent = config.hint;
    surface.appendChild(hint);
  }

  const bank = document.createElement('div');
  bank.className = 'word-bank__bank';
  bank.setAttribute('role', 'list');
  surface.appendChild(bank);

  const controls = document.createElement('div');
  controls.className = 'word-bank__controls';
  surface.appendChild(controls);

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'word-bank__button word-bank__button--check';
  check.textContent = 'Check';
  controls.appendChild(check);

  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'word-bank__button word-bank__button--reset';
  reset.textContent = 'Reset';
  controls.appendChild(reset);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  return {
    wrapper,
    surface,
    assembled,
    assembledPlaceholder: placeholder,
    bank,
    check,
    reset,
    feedback,
  };
}

function updateAssembledState(state) {
  const tiles = Array.from(state.assembled.querySelectorAll('.word-bank__tile'));
  state.selection = tiles.map((tile) => tile.dataset.tileValue || tile.textContent || '');
  if (state.placeholder) {
    state.placeholder.hidden = tiles.length > 0;
  }
  state.assembled.classList.toggle('word-bank__assembled--filled', tiles.length > 0);
  state.assembled.classList.remove('word-bank__assembled--error');
}

function handleTileInteraction(state, tile) {
  if (!tile || state.completed) return;
  const parent = tile.parentElement;
  if (parent === state.bank) {
    state.assembled.appendChild(tile);
    tile.classList.add('word-bank__tile--selected');
  } else {
    state.bank.appendChild(tile);
    tile.classList.remove('word-bank__tile--selected');
  }
  updateAssembledState(state);
}

function renderTiles(state) {
  state.bank.innerHTML = '';
  state.tiles = state.config.wordBank.map((word, index) => {
    const tile = createTile(word);
    tile.classList.add('word-bank__tile');
    tile.dataset.tileKey = `${index}-${Math.random().toString(36).slice(2, 8)}`;
    tile.addEventListener('click', () => handleTileInteraction(state, tile));
    return tile;
  });

  shuffle(state.tiles.slice()).forEach((tile) => {
    state.bank.appendChild(tile);
  });
}

function resetState(state) {
  state.selection = [];
  state.tiles.forEach((tile) => {
    tile.disabled = false;
    tile.classList.remove('word-bank__tile--selected', 'word-bank__tile--locked');
    state.bank.appendChild(tile);
  });
  state.completed = false;
  state.check.disabled = false;
  state.reset.disabled = false;
  state.assembled.classList.remove('word-bank__assembled--correct', 'word-bank__assembled--error');
  updateAssembledState(state);
}

function lockTiles(state) {
  state.tiles.forEach((tile) => {
    tile.disabled = true;
    tile.classList.add('word-bank__tile--locked');
  });
  state.check.disabled = true;
  state.reset.disabled = true;
  state.assembled.classList.add('word-bank__assembled--correct');
}

async function prepareConfig() {
  const vocab = await fetchLessonVocab();
  const context = window.BashaLanka?.currentLesson || {};
  const lessonNumber = resolveLessonNumber(context) || 1;
  let allVocabs = await fetchAllLessonVocabsUpTo(lessonNumber);
  if (!Array.isArray(allVocabs) || !allVocabs.length) {
    allVocabs = vocab || [];
  }
  const prompts = await fetchWordBankPrompts();
  if (!prompts.length) {
    throw new Error('No WordBank prompts available for this lesson.');
  }
  const entry = prompts.length === 1 ? prompts[0] : prompts[Math.floor(Math.random() * prompts.length)];
  const distractorWords = collectDistractorWords(allVocabs);
  return buildWordBankConfig(entry, { distractorWords });
}

export async function initWordBankExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBank requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('WordBank target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  let config;
  if (configOverride && typeof configOverride === 'object') {
    const entry = normaliseWordBankEntry(configOverride);
    if (!entry) {
      throw new Error('Invalid WordBank config override supplied.');
    }
    const manualDistractors = Array.isArray(configOverride.distractors)
      ? configOverride.distractors
      : Array.isArray(configOverride.distractorWords)
      ? configOverride.distractorWords
      : [];
    config = buildWordBankConfig(entry, { distractorWords: manualDistractors });
    if (Array.isArray(configOverride.wordBank) && configOverride.wordBank.length) {
      const manualBank = configOverride.wordBank
        .map((word) => normaliseText(word))
        .filter(Boolean);
      if (manualBank.length) {
        config.wordBank = manualBank;
      }
    }
  } else {
    config = await prepareConfig();
  }
  const { wrapper, assembled, assembledPlaceholder, bank, check, reset, feedback } = buildLayout(config);

  target.innerHTML = '';
  target.appendChild(wrapper);

  const state = {
    config,
    assembled,
    placeholder: assembledPlaceholder,
    bank,
    check,
    reset,
    feedback,
    tiles: [],
    selection: [],
    completed: false,
    normalisedAnswers: config.answers.map(normaliseAnswer),
  };

  renderTiles(state);
  updateAssembledState(state);
  setStatusMessage(feedback, config.initialMessage || 'Tap tiles to build the sentence.', 'neutral');

  check.addEventListener('click', () => {
    if (state.completed) return;
    const attempt = normaliseAnswer(state.selection.join(' '));
    if (!attempt) {
      state.assembled.classList.add('word-bank__assembled--error');
      setStatusMessage(state.feedback, 'Select tiles to form a sentence first.', 'neutral');
      return;
    }
    if (state.normalisedAnswers.includes(attempt)) {
      state.completed = true;
      lockTiles(state);
      setStatusMessage(state.feedback, config.successMessage || 'Correct! Nice work.', 'success');
      if (typeof onComplete === 'function') {
        onComplete({ value: state.selection.slice() });
      }
    } else {
      state.assembled.classList.add('word-bank__assembled--error');
      setStatusMessage(state.feedback, config.errorMessage || 'Not quite, try again.', 'error');
    }
  });

  reset.addEventListener('click', () => {
    if (state.completed) return;
    resetState(state);
    setStatusMessage(state.feedback, config.initialMessage || 'Tap tiles to build the sentence.', 'neutral');
  });

  return state;
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBank = initWordBankExercise;
}

export default initWordBankExercise;