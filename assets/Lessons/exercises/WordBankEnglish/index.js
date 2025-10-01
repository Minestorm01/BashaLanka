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
} from '../_shared/word-bank-data.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank-english"]';
const STYLESHEET_ID = 'word-bank-english-styles';
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

function buildEnglishAnswerTiles(sentence) {
  return sentence.englishTokens.map((token, index) => ({
    id: `answer-${index}`,
    text: token.display || token.text || '',
    trailing: token.trailing || '',
    lower: token.lower || normaliseText(token.text || '').toLowerCase(),
    isAnswer: true,
    location: 'bank',
    element: null,
  }));
}

function buildEnglishDistractorTiles(wordPool, answerTiles) {
  const required = new Set(answerTiles.map((tile) => tile.lower));
  const pool = wordPool.filter((word) => word && word.lower && !required.has(word.lower));
  const selection = shuffle(pool).slice(0, MAX_DISTRACTOR_WORDS);
  return selection.map((word, index) => ({
    id: `distractor-${index}`,
    text: word.text,
    trailing: '',
    lower: word.lower,
    isAnswer: false,
    location: 'bank',
    element: null,
  }));
}

function createTileElement(tile, state) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank__tile word-bank__tile--english';
  button.setAttribute('data-location', tile.location);
  button.dataset.tileId = tile.id;
  button.textContent = tile.text;
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
  state.placeholder.hidden = state.assembled.length > 0;
}

function buildEnglishSentenceFromTiles(tiles) {
  const parts = tiles.map((tile) => `${tile.text}${tile.trailing || ''}`);
  const raw = parts.join(' ').trim().replace(/\s+([,!?])/g, '$1');
  return normaliseText(raw);
}

function handleCheck(state) {
  if (state.completed) return;
  state.assembledContainer.classList.remove('word-bank__assembled--error');
  state.assembledContainer.classList.remove('word-bank__assembled--correct');
  const assembledText = buildEnglishSentenceFromTiles(state.assembled);
  if (!assembledText) {
    setStatusMessage(state.feedback, 'Add tiles to build your answer.', 'neutral');
    return;
  }
  const normalised = normaliseSentenceForComparison(assembledText);
  const isCorrect = state.sentence.englishAnswersNormalised.some(
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
  wrapper.className = 'word-bank word-bank--english';

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
  prompt.textContent = sentence.promptSinhala || joinWordSequence(sentence.words, 'si');
  bubble.appendChild(prompt);

  const transliteration = joinWordSequence(sentence.words, 'translit');
  if (transliteration) {
    const promptTranslit = document.createElement('span');
    promptTranslit.className = 'word-bank__prompt-translit';
    promptTranslit.textContent = transliteration;
    bubble.appendChild(promptTranslit);
  }

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  assembled.setAttribute('role', 'group');
  assembled.setAttribute('aria-label', 'Your English sentence');
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

export async function initWordBankEnglish(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankEnglish requires a browser environment.');
  }
  const target =
    options.target || document.querySelector(options.selector || DEFAULT_CONTAINER_SELECTOR);
  if (!target) {
    throw new Error('Word bank container not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  const { sentences, englishWordPool } = await loadWordBankLessonData();
  const baseSentence = sentences[Math.floor(Math.random() * sentences.length)];
  const sentence = {
    ...baseSentence,
    successMessage:
      baseSentence.successMessageEnglish || baseSentence.successMessage || 'Correct! Great job.',
    errorMessage:
      baseSentence.errorMessageEnglish || baseSentence.errorMessage || 'Not quite, try again.',
    initialMessage:
      baseSentence.initialMessageEnglish || 'Tap tiles to build the English sentence.',
    instructions:
      baseSentence.instructionsEnglish || 'Tap the tiles to build the sentence in English.',
  };

  const answerTiles = buildEnglishAnswerTiles(sentence);
  const distractorTiles = buildEnglishDistractorTiles(englishWordPool, answerTiles);
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
  window.BashaLanka.exercises.WordBankEnglish = initWordBankEnglish;
}

export default initWordBankEnglish;
