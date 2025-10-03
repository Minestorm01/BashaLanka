import {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  randomItem,
  shuffleArray,
  getWordEntryFromUnit,
} from '../_shared/wordBankUtils.js';
import { getVocabEntry } from '../_shared/vocabMap.js';
import { ensureStylesheet } from '../_shared/utils.js';

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
  const defaultMessage = 'Arrange the tiles to match the sentence!';

  const wrapper = document.createElement('section');
  wrapper.className = 'wordbank wordbank--english lesson-card';

  const mascot = document.createElement('div');
  mascot.className = 'lesson-mascot';
  mascot.innerHTML = `
    <img src="/assets/general/mascot.svg" alt="Mascot" class="mascot-img" />
    <div class="speech-bubble">
      <p>${defaultMessage}</p>
    </div>
  `;
  wrapper.appendChild(mascot);

  const bubbleText = mascot.querySelector('.speech-bubble p');
  if (bubbleText) {
    bubbleText.setAttribute('role', 'status');
    bubbleText.setAttribute('aria-live', 'polite');
  }

  const prompt = document.createElement('p');
  prompt.className = 'wordbank__prompt flashcard';
  wrapper.appendChild(prompt);

  const tileContainer = document.createElement('div');
  tileContainer.className = 'wordbank__tiles tile-grid';
  wrapper.appendChild(tileContainer);

  const answerGroup = document.createElement('div');
  answerGroup.className = 'wordbank__answer-row';

  const answerLabel = document.createElement('span');
  answerLabel.className = 'wordbank__answer-label';
  answerLabel.textContent = 'Your answer';
  answerGroup.appendChild(answerLabel);

  const answerContainer = document.createElement('div');
  answerContainer.className = 'wordbank__answer';
  answerGroup.appendChild(answerContainer);

  wrapper.appendChild(answerGroup);

  const actions = document.createElement('div');
  actions.className = 'wordbank__actions flex gap-2';
  wrapper.appendChild(actions);

  const checkBtn = createActionButton('✅', 'Check');
  checkBtn.disabled = true;
  actions.appendChild(checkBtn);

  const clearBtn = createActionButton('🧹', 'Clear');
  actions.appendChild(clearBtn);

  const nextBtn = createActionButton('⏭️', 'Next');
  actions.appendChild(nextBtn);

  if (typeof onComplete === 'function') {
    const finishBtn = createActionButton('🎉', 'Finish');
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

  function createActionButton(icon, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn--pill';
    button.innerHTML = `<span aria-hidden="true">${icon}</span><span>${label}</span>`;
    return button;
  }

  function setSentence(sentence) {
    currentSentence = sentence;
    if (!sentence) {
      prompt.textContent = '';
      tileContainer.innerHTML = '';
      answerContainer.innerHTML = '';
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
    answerContainer.innerHTML = '';
    answer.forEach((entry) => {
      const chip = document.createElement('span');
      chip.className = 'wordbank__answer-chip';
      chip.textContent = entry.text;
      answerContainer.appendChild(chip);
    });
    checkBtn.disabled = answer.length === 0;
  }

  function setFeedback(message) {
    if (bubbleText) {
      bubbleText.textContent = message || defaultMessage;
    }
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

  tokens.forEach((token) => {
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
    wrapper.appendChild(translit);

    container.appendChild(wrapper);
  });
}
