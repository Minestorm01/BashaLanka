import {
  ensureStylesheet,
  setStatusMessage,
  shuffle,
} from '../_shared/utils.js';
import {
  loadWordBankData,
  prepareSentenceInstance,
  normaliseTokenKey,
} from '../WordBank/shared.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank-sinhala"]';
const STYLESHEET_ID = 'word-bank-sinhala-styles';
const INITIAL_MESSAGE = 'Tap tiles to build the Sinhala sentence.';
const SUCCESS_MESSAGE = 'Correct! Great job building the sentence.';
const ERROR_MESSAGE = 'Not quite, try again.';
const EMPTY_MESSAGE = 'Select tiles to build your answer first.';
const MAX_DISTRACTOR_COUNT = 6;

function createTileElement(tile) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank__tile';
  button.dataset.tileKey = tile.key;
  button.setAttribute('aria-pressed', 'false');

  const script = document.createElement('span');
  script.className = 'word-bank__tile-script';
  script.textContent = tile.si || tile.translit || tile.token;
  button.appendChild(script);

  if (tile.translit && tile.si) {
    const transliteration = document.createElement('span');
    transliteration.className = 'word-bank__tile-translit';
    transliteration.textContent = tile.translit;
    button.appendChild(transliteration);
  }

  return button;
}

function buildLayout(sentence) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank word-bank--sinhala';

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
  prompt.className = 'word-bank__prompt';
  prompt.textContent = sentence.englishText;
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

function gatherDistractors(vocabIndex, answerTokens) {
  const answerIdentities = new Set(
    answerTokens.map((token) => `${token.si}|${token.translit}`)
  );
  const options = new Map();
  let counter = 0;
  vocabIndex.forEach((data, alias) => {
    if (!data || !data.si) return;
    const identity = `${data.si}|${data.translit}`;
    if (answerIdentities.has(identity)) return;
    if (options.has(identity)) return;
    const keyCandidate = normaliseTokenKey(alias);
    if (!keyCandidate) return;
    options.set(identity, {
      id: `d-${(counter += 1)}`,
      key: keyCandidate,
      si: data.si,
      translit: data.translit,
      en: data.en,
      isAnswer: false,
    });
  });
  return Array.from(options.values());
}

function buildTiles(sentence, vocabIndex) {
  const answerTiles = sentence.tokens.map((token, index) => ({
    id: `a-${index}`,
    key: token.key,
    si: token.si,
    translit: token.translit,
    en: token.en,
    token: token.token,
    isAnswer: true,
  }));

  const distractorPool = gatherDistractors(vocabIndex, sentence.tokens);
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
  const normalisedAnswer = assembledTiles.map((tile) =>
    normaliseTokenKey(tile.dataset.tileKey)
  );
  const expected = state.solutionKeys;
  const correct =
    normalisedAnswer.length === expected.length &&
    normalisedAnswer.every((value, index) => value === expected[index]);
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

function enhancePlaceholder(sentence, assembled) {
  if (!Array.isArray(sentence.placeholders) || !sentence.placeholders.length) {
    return;
  }
  const fragment = document.createDocumentFragment();
  sentence.placeholders.forEach((placeholder) => {
    const span = document.createElement('span');
    span.className = 'word-bank__placeholder-addon';
    span.textContent = placeholder.si || placeholder.translit || placeholder.en;
    fragment.appendChild(span);
  });
  assembled.appendChild(fragment);
}

async function initialise(container) {
  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  const data = await loadWordBankData();
  const sentenceDefinition = shuffle(data.sentences).find(Boolean);
  if (!sentenceDefinition) {
    throw new Error('No eligible Sinhala word bank sentences available.');
  }
  const sentence = prepareSentenceInstance(sentenceDefinition, data.vocabIndex);
  if (!sentence) {
    throw new Error('Failed to prepare Sinhala word bank sentence.');
  }

  const tiles = buildTiles(sentence, data.vocabIndex);
  if (!tiles.length) {
    throw new Error('Word bank requires at least one tile.');
  }

  const layout = buildLayout(sentence);
  enhancePlaceholder(sentence, layout.assembled);

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
    solutionKeys: sentence.tokens.map((token) => token.key),
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

export async function initWordBankSinhala(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankSinhala requires a browser environment.');
  }
  const targetSelector = options.target || DEFAULT_CONTAINER_SELECTOR;
  const container =
    typeof targetSelector === 'string'
      ? document.querySelector(targetSelector)
      : targetSelector;
  if (!container) {
    throw new Error('WordBankSinhala target element not found.');
  }
  await initialise(container);
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBankSinhala = initWordBankSinhala;
}

export default initWordBankSinhala;
