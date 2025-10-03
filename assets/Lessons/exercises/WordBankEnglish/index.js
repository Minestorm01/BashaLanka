import { ensureStylesheet } from '../_shared/utils.js';
import {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  getWordEntryFromUnit,
} from '../_shared/wordBankUtils.js';
import { renderWordBankPrompt } from '../_shared/wordBankPrompt.js';

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

  if (!target) return;

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  target.innerHTML = '<p>Loading…</p>';

  try {
    const units = await loadWordBankUnits();
    const activeUnit = resolveActiveUnit(units, providedUnitId);
    if (!activeUnit) {
      target.innerHTML = '<p>No data.</p>';
      return;
    }

    const sentences = getUnitSentences(activeUnit);
    if (!sentences.length) {
      target.innerHTML = '<p>No sentences.</p>';
      return;
    }

    setupExercise(target, activeUnit, sentences, { onComplete });
  } catch (err) {
    console.error(err);
    target.innerHTML = '<p>Error loading.</p>';
  }
}

function setupExercise(container, unit, sentences, { onComplete } = {}) {
  container.innerHTML = '';

  const wrapper = document.createElement('section');
  wrapper.className = 'wordbank wordbank--english';

  const promptContainer = document.createElement('div');
  promptContainer.className = 'wordbank__prompt';
  wrapper.appendChild(promptContainer);

  const instruction = document.createElement('p');
  instruction.className = 'wordbank__instruction';
  instruction.textContent = 'Arrange the English tiles to match the Sinhala sentence.';
  wrapper.appendChild(instruction);

  const tileContainer = document.createElement('div');
  tileContainer.className = 'wordbank__tiles';
  wrapper.appendChild(tileContainer);

  const answerLabel = document.createElement('p');
  answerLabel.className = 'wordbank__answer-label';
  answerLabel.textContent = 'Your answer';
  wrapper.appendChild(answerLabel);

  const answerContainer = document.createElement('div');
  answerContainer.className = 'wordbank__answer';
  wrapper.appendChild(answerContainer);

  const feedback = document.createElement('p');
  feedback.className = 'wordbank__feedback';
  wrapper.appendChild(feedback);

  const actions = document.createElement('div');
  actions.className = 'wordbank__actions';
  wrapper.appendChild(actions);

  const checkBtn = document.createElement('button');
  checkBtn.textContent = 'Check';
  checkBtn.dataset.variant = 'primary';
  actions.appendChild(checkBtn);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  nextBtn.dataset.variant = 'secondary';
  actions.appendChild(nextBtn);

  if (typeof onComplete === 'function') {
    const finishBtn = document.createElement('button');
    finishBtn.textContent = 'Finish';
    finishBtn.dataset.variant = 'ghost';
    finishBtn.addEventListener('click', () => onComplete());
    actions.appendChild(finishBtn);
  }

  container.appendChild(wrapper);

  let currentSentence = null;
  let tiles = [];
  let answer = [];

  function setSentence(sentence) {
    currentSentence = sentence;
    if (!sentence) return;

    renderWordBankPrompt(promptContainer, sentence, unit);

    const enWords = sentence.tokens.map((t) => getWordEntryFromUnit(unit, t)?.en || t);
    tiles = shuffle(enWords.map((text, i) => ({ id: `tile-${i}`, text, used: false })));

    answer = [];
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function updateTiles() {
    tileContainer.innerHTML = '';
    tiles.forEach((tile) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wordbank__tile';
      btn.textContent = tile.text;
      btn.disabled = tile.used;
      btn.addEventListener('click', () => handleTile(tile));
      tileContainer.appendChild(btn);
    });
  }

  function updateAnswer() {
    answerContainer.innerHTML = '';

    if (!answer.length) {
      const placeholder = document.createElement('span');
      placeholder.className = 'wordbank__answer-placeholder';
      placeholder.textContent = 'Tap tiles to build your translation';
      answerContainer.appendChild(placeholder);
      return;
    }

    answer.forEach((tile, index) => {
      const tokenBtn = document.createElement('button');
      tokenBtn.type = 'button';
      tokenBtn.className = 'wordbank__answer-tile';
      tokenBtn.textContent = tile.text;
      tokenBtn.addEventListener('click', () => removeTile(index));
      answerContainer.appendChild(tokenBtn);
    });
  }

  function handleTile(tile) {
    if (tile.used) return;
    tile.used = true;
    answer.push(tile);
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function removeTile(index) {
    const [removed] = answer.splice(index, 1);
    if (removed) {
      const tile = tiles.find((item) => item.id === removed.id);
      if (tile) {
        tile.used = false;
      }
    }
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function handleCheck() {
    if (!currentSentence) return;
    const attempt = answer.map((a) => a.text);
    const correct = currentSentence.tokens.map(
      (t) => getWordEntryFromUnit(unit, t)?.en || t,
    );
    if (arraysEqual(attempt, correct)) {
      setFeedback('✅ Correct!', 'correct');
    } else {
      setFeedback(`❌ Correct: ${correct.join(' ')}`, 'incorrect');
    }
  }

  function handleNext() {
    const next = randomItem(sentences.filter((s) => s !== currentSentence));
    setSentence(next || randomItem(sentences));
  }

  checkBtn.addEventListener('click', handleCheck);
  nextBtn.addEventListener('click', handleNext);

  setSentence(randomItem(sentences));

  function setFeedback(message, state) {
    feedback.textContent = message;
    if (state) {
      feedback.setAttribute('data-state', state);
    } else {
      feedback.removeAttribute('data-state');
    }
  }
}
function shuffle(arr) {
  return arr
    .map((v) => ({ v, sort: Math.random() }))
    .sort((a, b) => a.sort - b.sort)
    .map(({ v }) => v);
}
function randomItem(arr) {
  return !arr.length ? null : arr[Math.floor(Math.random() * arr.length)];
}
function arraysEqual(a, b) {
  return a.length === b.length && a.every((val, i) => val === b[i]);
}
