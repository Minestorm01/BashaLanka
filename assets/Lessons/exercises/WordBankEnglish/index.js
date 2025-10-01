import {
  ensureStylesheet,
  setStatusMessage,
  shuffle,
} from '../_shared/utils.js';
import {
  loadWordBankData,
  prepareSentenceInstance,
  splitEnglishWords,
} from '../WordBank/shared.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank-english"]';
const STYLESHEET_ID = 'word-bank-english-styles';
const INITIAL_MESSAGE = 'Tap tiles to build the English sentence.';
const SUCCESS_MESSAGE = 'Correct! Great job translating.';
const ERROR_MESSAGE = 'Not quite, try again.';
const EMPTY_MESSAGE = 'Select tiles to build your answer first.';
const MAX_DISTRACTOR_COUNT = 6;

function createTileElement(tile) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank__tile';
  button.dataset.tileKey = tile.key;
  button.dataset.tileValue = tile.value;
  button.setAttribute('aria-pressed', 'false');
  button.textContent = tile.value;
  return button;
}

function buildLayout(sentence) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank word-bank--english';

  const surface = document.createElement('div');
  surface.className = 'word-bank__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'word-bank__header';
  surface.appendChild(header);

  const headerMain = document.createElement('div');
  headerMain.className = 'word-bank__header-main';
  header.appendChild(headerMain);

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
  headerMain.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank__bubble';
  headerMain.appendChild(bubble);

  const prompt = document.createElement('p');
  prompt.className = 'word-bank__prompt word-bank__prompt--si';
  prompt.textContent = sentence.sinhalaPrompt || '...';
  bubble.appendChild(prompt);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  bubble.appendChild(assembled);

  const placeholder = document.createElement('span');
  placeholder.className = 'word-bank__placeholder';
  placeholder.textContent = INITIAL_MESSAGE;
  assembled.appendChild(placeholder);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank__feedback';
  feedback.dataset.status = 'neutral';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  bubble.appendChild(feedback);

  const bank = document.createElement('div');
  bank.className = 'word-bank__bank';
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

  return {
    wrapper,
    surface,
    prompt,
    assembled,
    placeholder,
    feedback,
    bank,
    check,
    reset,
  };
}

function gatherDistractors(vocabIndex, answerWords) {
  const answerSet = new Set(answerWords.map((word) => word.toLowerCase()));
  const options = new Map();
  let counter = 0;
  vocabIndex.forEach((data) => {
    if (!data || !data.en) return;
    const words = splitEnglishWords(data.en);
    words.forEach((word) => {
      const trimmed = word.trim();
      if (!trimmed) return;
      if (!/[A-Za-z]/.test(trimmed)) return;
      const display = trimmed
        .replace(/^[^A-Za-z0-9]+/, '')
        .replace(/[^A-Za-z0-9]+$/, '');
      if (!display) return;
      const lower = display.toLowerCase();
      if (answerSet.has(lower)) return;
      if (options.has(lower)) return;
      options.set(lower, {
        id: `d-${(counter += 1)}`,
        key: lower,
        value: display,
        isAnswer: false,
      });
    });
  });
  return Array.from(options.values());
}

function buildTiles(sentence, vocabIndex) {
  const answerTiles = sentence.englishWords.map((word, index) => ({
    id: `a-${index}`,
    key: word.toLowerCase(),
    value: word,
    isAnswer: true,
  }));

  const distractorPool = gatherDistractors(vocabIndex, sentence.englishWords);
  const distractorTiles = shuffle(distractorPool).slice(0, MAX_DISTRACTOR_COUNT);

  return shuffle([...answerTiles, ...distractorTiles]);
}

function updatePlaceholder(state) {
  const hasSelection = Boolean(state.assembled.querySelector('[data-tile-key]'));
  state.placeholder.hidden = hasSelection;
  state.assembled.classList.toggle('word-bank__assembled--filled', hasSelection);
  state.assembled.classList.remove('word-bank__assembled--error');
}

function resetTiles(state) {
  state.completed = false;
  state.tiles.forEach((tile) => {
    tile.disabled = false;
    tile.classList.remove('word-bank__tile--selected', 'word-bank__tile--locked');
    tile.setAttribute('aria-pressed', 'false');
    state.bank.appendChild(tile);
  });
  state.assembled.classList.remove('word-bank__assembled--correct');
  updatePlaceholder(state);
  setStatusMessage(state.feedback, INITIAL_MESSAGE, 'neutral');
}

function moveTile(state, tile) {
  if (state.completed) return;
  const parent = tile.parentElement;
  if (parent === state.bank) {
    state.assembled.appendChild(tile);
    tile.classList.add('word-bank__tile--selected');
    tile.setAttribute('aria-pressed', 'true');
  } else {
    state.bank.appendChild(tile);
    tile.classList.remove('word-bank__tile--selected');
    tile.setAttribute('aria-pressed', 'false');
  }
  updatePlaceholder(state);
}

function bindTileInteractions(state) {
  state.tiles.forEach((tile) => {
    tile.addEventListener('click', () => moveTile(state, tile));
  });
}

function handleCheck(state) {
  if (state.completed) return;
  const assembledTiles = Array.from(state.assembled.querySelectorAll('[data-tile-key]'));
  if (!assembledTiles.length) {
    setStatusMessage(state.feedback, EMPTY_MESSAGE, 'neutral');
    state.assembled.classList.add('word-bank__assembled--error');
    return;
  }
  const answer = assembledTiles.map((tile) => tile.dataset.tileKey);
  const correct =
    answer.length === state.solutionKeys.length &&
    answer.every((value, index) => value === state.solutionKeys[index]);
  if (correct) {
    state.completed = true;
    state.tiles.forEach((tile) => {
      tile.disabled = true;
      tile.classList.add('word-bank__tile--locked');
    });
    state.assembled.classList.add('word-bank__assembled--correct');
    setStatusMessage(state.feedback, SUCCESS_MESSAGE, 'success');
  } else {
    state.assembled.classList.add('word-bank__assembled--error');
    setStatusMessage(state.feedback, ERROR_MESSAGE, 'error');
  }
}

async function initialise(container) {
  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  const data = await loadWordBankData();
  const sentenceDefinition = shuffle(data.sentences).find(Boolean);
  if (!sentenceDefinition) {
    throw new Error('No eligible English word bank sentences available.');
  }
  const sentence = prepareSentenceInstance(sentenceDefinition, data.vocabIndex);
  if (!sentence) {
    throw new Error('Failed to prepare English word bank sentence.');
  }

  const tiles = buildTiles(sentence, data.vocabIndex);
  if (!tiles.length) {
    throw new Error('Word bank requires at least one tile.');
  }

  const layout = buildLayout(sentence);
  container.innerHTML = '';
  container.appendChild(layout.wrapper);

  const tileElements = tiles.map((tile) => createTileElement(tile));
  tileElements.forEach((el) => layout.bank.appendChild(el));

  const state = {
    assembled: layout.assembled,
    bank: layout.bank,
    feedback: layout.feedback,
    placeholder: layout.placeholder,
    tiles: tileElements,
    solutionKeys: sentence.englishWords.map((word) => word.toLowerCase()),
    completed: false,
  };

  bindTileInteractions(state);
  setStatusMessage(state.feedback, INITIAL_MESSAGE, 'neutral');
  updatePlaceholder(state);

  layout.check.addEventListener('click', (event) => {
    event.preventDefault();
    handleCheck(state);
  });

  layout.reset.addEventListener('click', (event) => {
    event.preventDefault();
    resetTiles(state);
  });
}

export async function initWordBankEnglish(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankEnglish requires a browser environment.');
  }
  const targetSelector = options.target || DEFAULT_CONTAINER_SELECTOR;
  const container =
    typeof targetSelector === 'string'
      ? document.querySelector(targetSelector)
      : targetSelector;
  if (!container) {
    throw new Error('WordBankEnglish target element not found.');
  }
  await initialise(container);
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBankEnglish = initWordBankEnglish;
}

export default initWordBankEnglish;
