import {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  randomItem,
  shuffleArray,
  getWordEntryFromUnit,
} from '../_shared/wordBankUtils.js';
import { getVocabEntry } from '../_shared/vocabMap.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="wordbank-english"]';

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

  target.innerHTML = '<p>Loading sentences…</p>';

  try {
    const units = await loadWordBankUnits();
    const activeUnit = resolveActiveUnit(units, providedUnitId);
    if (!activeUnit) {
      target.innerHTML = '<p>No unit data available.</p>';
      return;
    }

    const sentences = getUnitSentences(activeUnit);
    if (!sentences.length) {
      target.innerHTML = '<p>No sentences available.</p>';
      return;
    }

    setupExercise(target, activeUnit, sentences, { onComplete });
  } catch (error) {
    console.error('Failed to initialise WordBankEnglish exercise', error);
    target.innerHTML = '<p>Unable to load sentences.</p>';
  }
}

function setupExercise(container, unit, sentences, { onComplete } = {}) {
  const wrapper = document.createElement('section');
  wrapper.className = 'wordbank wordbank--english';

  const title = document.createElement('h2');
  title.textContent = 'Word Bank (English)';
  wrapper.appendChild(title);

  const promptLabel = document.createElement('p');
  promptLabel.textContent = 'Sinhala prompt:';
  wrapper.appendChild(promptLabel);

  const prompt = document.createElement('p');
  prompt.className = 'wordbank__prompt';
  wrapper.appendChild(prompt);

  const instructions = document.createElement('p');
  instructions.className = 'wordbank__instructions';
  instructions.textContent = 'Arrange the English tiles to match the Sinhala prompt.';
  wrapper.appendChild(instructions);

  const tileContainer = document.createElement('div');
  tileContainer.className = 'wordbank__tiles';
  wrapper.appendChild(tileContainer);

  const answerLabel = document.createElement('p');
  answerLabel.textContent = 'Your answer:';
  wrapper.appendChild(answerLabel);

  const answerContainer = document.createElement('div');
  answerContainer.className = 'wordbank__answer';
  wrapper.appendChild(answerContainer);

  const feedback = document.createElement('div');
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
    finishBtn.addEventListener('click', () => {
      onComplete();
    });
    actions.appendChild(finishBtn);
  }

  container.innerHTML = '';
  container.appendChild(wrapper);

  let currentSentence = null;
  let tiles = [];
  let answer = [];

  function setSentence(sentence) {
    currentSentence = sentence;
    if (!sentence) {
      prompt.textContent = '';
      tileContainer.innerHTML = '';
      answerContainer.textContent = '';
      setFeedback('');
      return;
    }

    renderSinhalaPrompt(prompt, Array.isArray(sentence.tokens) ? sentence.tokens : [], unit);
    tiles = buildEnglishTiles(sentence);
    answer = [];
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function buildEnglishTiles(sentence) {
    const words = splitEnglishWords(sentence.text);
    return shuffleArray(
      words.map((word, index) => ({
        id: `word-${index}`,
        text: word,
        used: false,
      })),
    );
  }

  function updateTiles() {
    tileContainer.innerHTML = '';
    tiles.forEach((tile) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = tile.text;
      button.disabled = tile.used;
      button.addEventListener('click', () => handleTileSelect(tile));
      tileContainer.appendChild(button);
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
    answerContainer.textContent = answer.map((entry) => entry.text).join(' ');
    checkBtn.disabled = answer.length === 0;
  }

  function setFeedback(message) {
    feedback.textContent = message || '';
  }

  function handleCheck() {
    if (!currentSentence) {
      return;
    }
    const attempt = answer.map((entry) => entry.text);
    const correct = splitEnglishWords(currentSentence.text || '');
    const success =
      attempt.length === correct.length &&
      attempt.every((word, index) => word === correct[index]);

    if (success) {
      setFeedback('✅ Correct!');
    } else {
      setFeedback(`❌ Correct order: ${correct.join(' ')}`);
    }
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
      while (nextSentence === currentSentence && guard < 10) {
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

function splitEnglishWords(text) {
  if (typeof text !== 'string') {
    return [];
  }
  return text
    .split(/\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function renderSinhalaPrompt(container, tokens, unit) {
  container.innerHTML = '';
  if (!Array.isArray(tokens) || !tokens.length) {
    return;
  }

  tokens.forEach((token, index) => {
    if (index > 0) {
      container.appendChild(document.createTextNode(' '));
    }

    const mapping = getWordEntryFromUnit(unit, token) || getVocabEntry(token);
    const wrapper = document.createElement('span');
    wrapper.className = 'wordbank__prompt-token';

    const scriptSpan = document.createElement('span');
    scriptSpan.className = 'si';
    scriptSpan.textContent = mapping.si;

    const translit = document.createElement('small');
    translit.className = 'translit';
    translit.textContent = mapping.translit;

    wrapper.appendChild(scriptSpan);
    wrapper.appendChild(document.createTextNode(' '));
    wrapper.appendChild(translit);

    container.appendChild(wrapper);
  });
}
