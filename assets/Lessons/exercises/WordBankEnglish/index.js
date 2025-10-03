import { ensureStylesheet } from '../_shared/utils.js';
import {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  getWordEntryFromUnit,
} from '../_shared/wordBankUtils.js';

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

  const mascotWrap = document.createElement('div');
  mascotWrap.className = 'mascot-wrap';

  const mascot = document.createElement('div');
  mascot.className = 'mascot';
  mascot.textContent = '🦁';
  mascotWrap.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'speech-bubble';
  mascotWrap.appendChild(bubble);

  const prompt = document.createElement('p');
  prompt.className = 'wordbank__prompt';
  bubble.appendChild(prompt);

  wrapper.appendChild(mascotWrap);

  const instruction = document.createElement('p');
  instruction.className = 'wordbank__instruction';
  instruction.textContent = 'Arrange the English tiles to match the Sinhala sentence:';
  wrapper.appendChild(instruction);

  const tileContainer = document.createElement('div');
  tileContainer.className = 'wordbank__tiles';
  wrapper.appendChild(tileContainer);

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
  actions.appendChild(checkBtn);

  const nextBtn = document.createElement('button');
  nextBtn.textContent = 'Next';
  actions.appendChild(nextBtn);

  if (typeof onComplete === 'function') {
    const finishBtn = document.createElement('button');
    finishBtn.textContent = 'Finish';
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

    const siParts = sentence.tokens.map((t) => getWordEntryFromUnit(unit, t)?.si || t);
    prompt.textContent = siParts.join(' ');

    const enWords = sentence.tokens.map((t) => getWordEntryFromUnit(unit, t)?.en || t);
    tiles = shuffle(enWords.map((text, i) => ({ id: `tile-${i}`, text, used: false })));

    answer = [];
    updateTiles();
    updateAnswer();
    feedback.textContent = '';
  }

  function updateTiles() {
    tileContainer.innerHTML = '';
    tiles.forEach((tile) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = tile.text;
      btn.disabled = tile.used;
      btn.addEventListener('click', () => handleTile(tile));
      tileContainer.appendChild(btn);
    });
  }

  function updateAnswer() {
    answerContainer.textContent = answer.map((a) => a.text).join(' ');
  }

  function handleTile(tile) {
    if (tile.used) return;
    tile.used = true;
    answer.push(tile);
    updateTiles();
    updateAnswer();
  }

  function handleCheck() {
    if (!currentSentence) return;
    const attempt = answer.map((a) => a.text);
    const correct = currentSentence.tokens.map(
      (t) => getWordEntryFromUnit(unit, t)?.en || t,
    );
    feedback.textContent = arraysEqual(attempt, correct)
      ? '✅ Correct!'
      : `❌ Correct: ${correct.join(' ')}`;
  }

  function handleNext() {
    const next = randomItem(sentences.filter((s) => s !== currentSentence));
    setSentence(next || randomItem(sentences));
  }

  checkBtn.addEventListener('click', handleCheck);
  nextBtn.addEventListener('click', handleNext);

  setSentence(randomItem(sentences));
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
