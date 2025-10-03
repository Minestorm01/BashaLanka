import { ensureStylesheet } from '../_shared/utils.js';
import {
  loadSectionSentences,
  flattenSentences,
  filterUnlockedSentences,
  randomItem,
  shuffleArray,
} from '../_shared/wordBankUtils.js';
import { getVocabEntry } from '../_shared/vocabMap.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="wordbank-english"]';
const STYLESHEET_ID = 'wordbank-english-styles';

export default async function initWordBankEnglishExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankEnglish requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    onComplete,
    unitId: providedUnitId,
  } = options;

  if (!target) {
    throw new Error('WordBankEnglish target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  target.innerHTML = '<p>Loading sentences…</p>';

  try {
    const units = await loadSectionSentences();
    const sentences = filterUnlockedSentences(flattenSentences(units), providedUnitId);

    if (!sentences.length) {
      target.innerHTML = '<p>No sentences available.</p>';
      return;
    }

    setupExercise(target, sentences, { onComplete });
  } catch (error) {
    console.error('Failed to initialise WordBankEnglish exercise', error);
    target.innerHTML = '<p>Unable to load sentences.</p>';
  }
}

function setupExercise(container, sentences, { onComplete } = {}) {
  const wrapper = document.createElement('section');
  wrapper.className = 'wordbank wordbank--english';

  const title = document.createElement('h2');
  title.className = 'wordbank__title';
  title.textContent = 'Word Bank — English';
  wrapper.appendChild(title);

  const promptWrapper = document.createElement('div');
  promptWrapper.className = 'wordbank__prompt';
  wrapper.appendChild(promptWrapper);

  const instructions = document.createElement('p');
  instructions.className = 'wordbank__instructions';
  instructions.textContent = 'Tap the English tiles to build the translation.';
  wrapper.appendChild(instructions);

  const tilesContainer = document.createElement('div');
  tilesContainer.className = 'wordbank__tiles';
  wrapper.appendChild(tilesContainer);

  const answerLabel = document.createElement('p');
  answerLabel.className = 'wordbank__answer-label';
  answerLabel.textContent = 'Your answer:';
  wrapper.appendChild(answerLabel);

  const answerContainer = document.createElement('div');
  answerContainer.className = 'wordbank__answer';
  wrapper.appendChild(answerContainer);

  const feedback = document.createElement('p');
  feedback.className = 'wordbank__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  wrapper.appendChild(feedback);

  const actions = document.createElement('div');
  actions.className = 'wordbank__actions';
  wrapper.appendChild(actions);

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.textContent = 'Check';
  checkBtn.disabled = true;
  actions.appendChild(checkBtn);

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.textContent = 'Clear';
  actions.appendChild(clearBtn);

  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.textContent = 'Next';
  actions.appendChild(nextBtn);

  if (typeof onComplete === 'function') {
    const finishBtn = document.createElement('button');
    finishBtn.type = 'button';
    finishBtn.textContent = 'Finish';
    finishBtn.addEventListener('click', () => onComplete());
    actions.appendChild(finishBtn);
  }

  container.innerHTML = '';
  container.appendChild(wrapper);

  let currentSentence = null;
  let tiles = [];
  let answer = [];
  let correctTiles = [];

  function setSentence(sentence) {
    currentSentence = sentence;
    if (!sentence) {
      promptWrapper.innerHTML = '';
      tilesContainer.innerHTML = '';
      answerContainer.innerHTML = '';
      setFeedback('');
      checkBtn.disabled = true;
      return;
    }

    renderSinhalaPrompt(promptWrapper, Array.isArray(sentence.tokens) ? sentence.tokens : []);
    correctTiles = splitEnglishIntoTiles(sentence.text);
    tiles = shuffleArray(
      correctTiles.map((text, index) => ({
        id: `tile-${index}`,
        text,
        used: false,
      })),
    );
    answer = [];

    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function updateTiles() {
    tilesContainer.innerHTML = '';
    tiles.forEach((tile) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wordbank__tile';
      button.textContent = tile.text;
      button.disabled = tile.used;
      button.addEventListener('click', () => handleTileSelect(tile));
      tilesContainer.appendChild(button);
    });
  }

  function handleTileSelect(tile) {
    if (!tile || tile.used) {
      return;
    }
    tile.used = true;
    answer.push(tile);
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function updateAnswer() {
    answerContainer.innerHTML = '';

    if (!answer.length) {
      const placeholder = document.createElement('span');
      placeholder.className = 'wordbank__answer-placeholder';
      placeholder.textContent = 'Tap tiles to build your translation';
      answerContainer.appendChild(placeholder);
      checkBtn.disabled = true;
      return;
    }

    answer.forEach((tile, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'wordbank__answer-tile';
      button.textContent = tile.text;
      button.addEventListener('click', () => removeTile(index));
      answerContainer.appendChild(button);
    });

    checkBtn.disabled = answer.length === 0;
  }

  function removeTile(index) {
    const [removed] = answer.splice(index, 1);
    if (removed) {
      const tile = tiles.find((entry) => entry.id === removed.id);
      if (tile) {
        tile.used = false;
      }
    }
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function handleCheck() {
    if (!currentSentence) {
      return;
    }
    const attempt = answer.map((entry) => entry.text);
    const isCorrect = arraysEqual(attempt, correctTiles);

    if (isCorrect) {
      setFeedback('✅ Correct!');
    } else {
      setFeedback(`❌ Correct order: ${formatTiles(correctTiles)}`);
    }
  }

  function setFeedback(message) {
    feedback.textContent = message || '';
  }

  function handleClear() {
    tiles.forEach((tile) => {
      tile.used = false;
    });
    answer = [];
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function handleNext() {
    if (!sentences.length) {
      return;
    }

    let nextSentence = randomItem(sentences);
    if (sentences.length > 1) {
      let guard = 0;
      while (nextSentence === currentSentence && guard < 8) {
        nextSentence = randomItem(sentences);
        guard += 1;
      }
    }

    handleClear();
    setSentence(nextSentence);
  }

  checkBtn.addEventListener('click', handleCheck);
  clearBtn.addEventListener('click', handleClear);
  nextBtn.addEventListener('click', handleNext);

  setSentence(randomItem(sentences));
}

function renderSinhalaPrompt(container, tokens) {
  container.innerHTML = '';
  if (!Array.isArray(tokens) || !tokens.length) {
    return;
  }

  tokens.forEach((token) => {
    const entry = getVocabEntry(token);
    const wrapper = document.createElement('span');
    wrapper.className = 'wordbank__prompt-token';

    const script = document.createElement('span');
    script.className = 'wordbank__prompt-si';
    script.textContent = entry.si || token;
    script.lang = 'si';

    const translit = document.createElement('span');
    translit.className = 'wordbank__prompt-translit';
    translit.textContent = entry.translit || '';
    translit.lang = 'si-Latn';

    wrapper.appendChild(script);
    if (translit.textContent) {
      wrapper.appendChild(translit);
    }

    container.appendChild(wrapper);
  });
}

function splitEnglishIntoTiles(text) {
  if (typeof text !== 'string') {
    return [];
  }

  const matches = text.match(/\{[^}]+\}|\[[^\]]+\]|[A-Za-z0-9'’\-]+|[.,!?]/g);
  if (!matches) {
    return [];
  }

  return matches;
}

function formatTiles(tokens) {
  return tokens.reduce((acc, token) => {
    if (!acc) {
      return token;
    }
    if (/^[.,!?]$/.test(token)) {
      return `${acc}${token}`;
    }
    return `${acc} ${token}`;
  }, '');
}

function arraysEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
