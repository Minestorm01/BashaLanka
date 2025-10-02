import {
  loadSectionSentences,
  flattenSentences,
  randomItem,
  shuffleArray,
} from '../_shared/wordBankUtils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="wordbank-sinhala"]';

export default async function initWordBankSinhalaExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankSinhala requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    onComplete,
  } = options;

  if (!target) {
    throw new Error('WordBankSinhala target element not found.');
  }

  target.innerHTML = '<p>Loading sentences…</p>';

  try {
    const units = await loadSectionSentences();
    const sentences = flattenSentences(units);
    if (!sentences.length) {
      target.innerHTML = '<p>No sentences available.</p>';
      return;
    }

    setupExercise(target, sentences, { onComplete });
  } catch (error) {
    console.error('Failed to initialise WordBankSinhala exercise', error);
    target.innerHTML = '<p>Unable to load sentences.</p>';
  }
}

function setupExercise(container, sentences, { onComplete } = {}) {
  const wrapper = document.createElement('section');
  wrapper.className = 'wordbank wordbank--sinhala';

  const title = document.createElement('h2');
  title.textContent = 'Word Bank (Sinhala)';
  wrapper.appendChild(title);

  const prompt = document.createElement('p');
  prompt.className = 'wordbank__prompt';
  wrapper.appendChild(prompt);

  const instructions = document.createElement('p');
  instructions.className = 'wordbank__instructions';
  instructions.textContent = 'Arrange the Sinhala tiles to match the English sentence.';
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

    prompt.textContent = sentence.text || '';
    tiles = buildSinhalaTiles(sentence);
    answer = [];
    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function buildSinhalaTiles(sentence) {
    const tileEntries = [];
    const tokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
    tokens.forEach((token, index) => {
      tileEntries.push({
        id: `token-${index}`,
        text: token,
        used: false,
      });
    });

    const seenDistractors = new Set();
    const unitVocab = Array.isArray(sentence.unitVocab) ? sentence.unitVocab : [];
    unitVocab.forEach((word) => {
      if (!word || typeof word !== 'string') {
        return;
      }
      if (tokens.includes(word)) {
        return;
      }
      if (seenDistractors.has(word)) {
        return;
      }
      seenDistractors.add(word);
      tileEntries.push({
        id: `extra-${word}`,
        text: word,
        used: false,
      });
    });

    return shuffleArray(tileEntries);
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
    const correct = Array.isArray(currentSentence.tokens) ? currentSentence.tokens : [];
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
