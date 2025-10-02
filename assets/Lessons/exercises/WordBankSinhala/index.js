import {
  ensureStylesheet,
  normaliseText,
  setStatusMessage,
  shuffle,
} from '../_shared/utils.js';
import {
  joinWordSequence,
  loadWordBankLessonData,
  normaliseSentenceForComparison,
  normaliseTokenKey,
} from '../_shared/word-bank-data.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank-sinhala"]';
const STYLESHEET_ID = 'word-bank-sinhala-styles';
const MAX_DISTRACTOR_WORDS = 6;

function resolveMascotSource() {
  const lessonContext = window.BashaLanka?.currentLesson || {};
  const detail = lessonContext.detail || {};
  const meta = lessonContext.meta || {};
  if (detail.mascot) {
    return detail.mascot;
  }
  if (meta.sectionNumber) {
    return `assets/sections/section-${meta.sectionNumber}/mascot.svg`;
  }
  const sectionMatch = detail.sectionId || meta.sectionId || '';
  const sectionNumberMatch = typeof sectionMatch === 'string' ? sectionMatch.match(/section-(\d+)/i) : null;
  if (sectionNumberMatch) {
    return `assets/sections/section-${sectionNumberMatch[1]}/mascot.svg`;
  }
  return 'assets/sections/section-1/mascot.svg';
}

function buildSinhalaTiles(sentence) {
  return sentence.words.map((word, index) => ({
    id: `answer-${index}`,
    si: word.si,
    translit: word.translit,
    key: word.key || normaliseTokenKey(word.si || word.translit || word.token),
    isAnswer: true,
    location: 'bank',
    element: null,
  }));
}

function buildDistractorTiles(vocabWords, answerTiles) {
  const requiredKeys = new Set(
    answerTiles.map((tile) => normaliseTokenKey(tile.si || tile.translit || ''))
  );
  const pool = vocabWords.filter((word) => {
    const key = normaliseTokenKey(word.si || word.translit || '');
    if (!key || requiredKeys.has(key)) return false;
    if (!word.si || /[\[\]{}]/.test(word.si)) return false;
    if (word.isMultiWord || (word.tokenCount && word.tokenCount > 1)) return false;
    return true;
  });
  const selection = shuffle(pool).slice(0, MAX_DISTRACTOR_WORDS);
  return selection.map((word, index) => ({
    id: `distractor-${index}`,
    si: word.si,
    translit: word.translit,
    key: normaliseTokenKey(word.si || word.translit || ''),
    isAnswer: false,
    location: 'bank',
    element: null,
  }));
}

function createTileElement(tile, state) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank__tile word-bank__tile--sinhala';
  button.setAttribute('data-location', tile.location);
  button.dataset.tileId = tile.id;

  const label = document.createElement('span');
  label.className = 'word-bank__tile-text';
  label.textContent = tile.si;
  button.appendChild(label);

  if (tile.translit) {
    const translit = document.createElement('span');
    translit.className = 'word-bank__tile-translit';
    translit.textContent = tile.translit;
    button.appendChild(translit);
  }

  button.addEventListener('click', () => {
    if (state.completed) return;
    toggleTilePlacement(tile, state);
  });

  tile.element = button;
  return button;
}

function toggleTilePlacement(tile, state) {
  if (tile.location === 'answer') {
    moveTileToBank(tile, state);
  } else {
    moveTileToAnswer(tile, state);
  }
  updatePlaceholder(state);
}

function moveTileToAnswer(tile, state) {
  tile.location = 'answer';
  tile.element.setAttribute('data-location', 'answer');
  tile.element.classList.add('word-bank__tile--selected');
  state.assembled.push(tile);
  state.answerContainer.appendChild(tile.element);
}

function moveTileToBank(tile, state) {
  tile.location = 'bank';
  tile.element.setAttribute('data-location', 'bank');
  tile.element.classList.remove('word-bank__tile--selected');
  state.assembled = state.assembled.filter((entry) => entry !== tile);
  state.bankContainer.appendChild(tile.element);
}

function updatePlaceholder(state) {
  if (!state.placeholder) return;
  if (state.assembled.length) {
    state.placeholder.hidden = true;
  } else {
    state.placeholder.hidden = false;
  }
}

function buildSinhalaSentenceFromTiles(tiles) {
  const raw = joinWordSequence(tiles, 'si');
  return normaliseText(raw);
}

function handleCheck(state) {
  if (state.completed) return;
  state.assembledContainer.classList.remove('word-bank__assembled--error');
  state.assembledContainer.classList.remove('word-bank__assembled--correct');
  const assembledText = buildSinhalaSentenceFromTiles(state.assembled);
  if (!assembledText) {
    setStatusMessage(state.feedback, 'Add tiles to build your answer.', 'neutral');
    return;
  }
  const normalised = normaliseSentenceForComparison(assembledText);
  const isCorrect = state.sentence.sinhalaAnswersNormalised.some(
    (answer) => answer === normalised
  );
  if (isCorrect) {
    state.completed = true;
    state.assembledContainer.classList.add('word-bank__assembled--correct');
    setStatusMessage(state.feedback, state.sentence.successMessage, 'success');
    state.checkButton.disabled = true;
    state.tiles.forEach((tile) => {
      tile.element.disabled = true;
      tile.element.classList.add('word-bank__tile--locked');
    });
    if (typeof state.onComplete === 'function') {
      state.onComplete({ sentenceId: state.sentence.id, value: assembledText });
    }
  } else {
    state.assembledContainer.classList.add('word-bank__assembled--error');
    setStatusMessage(state.feedback, state.sentence.errorMessage, 'error');
  }
}

function handleReset(state) {
  state.completed = false;
  state.assembledContainer.classList.remove('word-bank__assembled--correct');
  state.assembledContainer.classList.remove('word-bank__assembled--error');
  state.checkButton.disabled = false;
  state.tiles.forEach((tile) => {
    tile.element.disabled = false;
    moveTileToBank(tile, state);
    tile.element.classList.remove('word-bank__tile--locked');
  });
  updatePlaceholder(state);
  setStatusMessage(state.feedback, state.sentence.initialMessage, 'neutral');
}

function buildLayout(sentence, tiles, options = {}) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank word-bank--sinhala';

  const surface = document.createElement('div');
  surface.className = 'word-bank__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('div');
  header.className = 'word-bank__header';
  surface.appendChild(header);

  const headerMain = document.createElement('div');
  headerMain.className = 'word-bank__header-main';
  header.appendChild(headerMain);

  const mascot = document.createElement('img');
  mascot.className = 'word-bank__mascot';
  mascot.src = resolveMascotSource();
  mascot.alt = 'Lesson mascot';
  headerMain.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank__bubble';
  headerMain.appendChild(bubble);

  const prompt = document.createElement('h2');
  prompt.className = 'word-bank__prompt';
  prompt.textContent = sentence.text || 'Build the Sinhala sentence.';
  bubble.appendChild(prompt);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  assembled.setAttribute('role', 'group');
  assembled.setAttribute('aria-label', 'Your Sinhala sentence');
  bubble.appendChild(assembled);

  const placeholder = document.createElement('div');
  placeholder.className = 'word-bank__placeholder';
  placeholder.textContent = sentence.initialMessage;
  assembled.appendChild(placeholder);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank__feedback';
  feedback.setAttribute('data-status', 'neutral');
  feedback.setAttribute('role', 'status');
  bubble.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'word-bank__instructions';
  instructions.textContent = sentence.instructions;
  surface.appendChild(instructions);

  const tilesContainer = document.createElement('div');
  tilesContainer.className = 'word-bank__tiles';
  surface.appendChild(tilesContainer);

  const actions = document.createElement('div');
  actions.className = 'word-bank__actions';
  surface.appendChild(actions);

  const checkButton = document.createElement('button');
  checkButton.type = 'button';
  checkButton.className = 'word-bank__button word-bank__button--primary';
  checkButton.textContent = 'Check';
  actions.appendChild(checkButton);

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'word-bank__button';
  resetButton.textContent = 'Reset';
  actions.appendChild(resetButton);

  const state = {
    sentence,
    tiles,
    assembled: [],
    assembledContainer: assembled,
    answerContainer: assembled,
    bankContainer: tilesContainer,
    placeholder,
    feedback,
    checkButton,
    completed: false,
    onComplete: options.onComplete,
  };

  tiles.forEach((tile) => {
    const element = createTileElement(tile, state);
    tilesContainer.appendChild(element);
  });

  checkButton.addEventListener('click', () => handleCheck(state));
  resetButton.addEventListener('click', () => handleReset(state));

  setStatusMessage(feedback, sentence.initialMessage, 'neutral');
  updatePlaceholder(state);

  return { wrapper, state };
}

export async function initWordBankSinhala(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankSinhala requires a browser environment.');
  }
  const target =
    options.target || document.querySelector(options.selector || DEFAULT_CONTAINER_SELECTOR);
  if (!target) {
    throw new Error('Word bank container not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  const { sentences, vocabWords } = await loadWordBankLessonData();
  const baseSentence = sentences[Math.floor(Math.random() * sentences.length)];
  const sentence = {
    ...baseSentence,
    initialMessage:
      baseSentence.initialMessage && baseSentence.initialMessage !== 'Tap tiles to build the sentence.'
        ? baseSentence.initialMessage
        : 'Tap tiles to build the Sinhala sentence.',
    instructions:
      baseSentence.instructions && baseSentence.instructions !== 'Tap the tiles to build the sentence.'
        ? baseSentence.instructions
        : 'Tap the tiles to build the sentence in Sinhala.',
  };
  const answerTiles = buildSinhalaTiles(sentence);
  const distractorTiles = buildDistractorTiles(vocabWords, answerTiles);
  const tiles = shuffle([...answerTiles, ...distractorTiles]);

  const { wrapper, state } = buildLayout(sentence, tiles, {
    onComplete: options.onComplete,
  });

  state.tiles = tiles;

  target.innerHTML = '';
  target.appendChild(wrapper);

  return state;
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBankSinhala = initWordBankSinhala;
}

export default initWordBankSinhala;
