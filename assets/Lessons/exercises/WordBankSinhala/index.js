import {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  randomItem,
  shuffleArray,
  getWordEntryFromUnit,
  normaliseWordBankToken,
} from '../_shared/wordBankUtils.js';
import { getVocabEntry } from '../_shared/vocabMap.js';
import { ensureStylesheet } from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="wordbank-sinhala"]';
const STYLESHEET_ID = 'wordbank-sinhala-styles';

export default async function initWordBankSinhalaExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankSinhala requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    onComplete,
    unitId: providedUnitId,
  } = options;

  if (!target) {
    throw new Error('WordBankSinhala target element not found.');
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
    console.error('Failed to initialise WordBankSinhala exercise', error);
    target.innerHTML = '<p>Unable to load sentences.</p>';
  }
}

function setupExercise(container, unit, sentences, { onComplete } = {}) {
  const defaultMessage = 'Arrange the Sinhala tiles to match the English sentence!';

  const wrapper = document.createElement('section');
  wrapper.className = 'wordbank wordbank--sinhala lesson-card';

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

  const unitWords = Array.isArray(unit?.words) ? unit.words : [];
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
    const seenKeys = new Set();

    tokens.forEach((token, index) => {
      tileEntries.push(createTileEntry(unit, token, `token-${index}`));
      const normalised = normaliseWordBankToken(token);
      if (normalised) {
        seenKeys.add(normalised);
        if (normalised.includes('_')) {
          seenKeys.add(normalised.replace(/_/g, ''));
        }
      }
    });

    unitWords.forEach((word, index) => {
      if (!word) {
        return;
      }
      const keys = Array.isArray(word.normalizedKeys) ? word.normalizedKeys : [];
      const overlaps = keys.some((key) => key && seenKeys.has(key));
      if (overlaps) {
        return;
      }
      keys.forEach((key) => {
        if (key) {
          seenKeys.add(key);
        }
      });

      const baseToken = word.token || word.canonicalToken || word.translit || word.si || word.en;
      const tileToken = baseToken && typeof baseToken === 'string' ? baseToken : `word-${index}`;
      tileEntries.push(createTileEntry(unit, tileToken, `extra-${index}`, word));
    });

    return shuffleArray(tileEntries);
  }

  function updateTiles() {
    tileContainer.innerHTML = '';
    tiles.forEach((tile) => {
      const button = document.createElement('button');
      button.type = 'button';
      const scriptSpan = document.createElement('span');
      scriptSpan.className = 'si';
      scriptSpan.textContent = tile.mapping.si;
      const translit = document.createElement('small');
      translit.className = 'translit';
      translit.textContent = tile.mapping.translit;
      button.appendChild(scriptSpan);
      button.appendChild(translit);
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
      const wrapper = document.createElement('span');
      wrapper.className = 'wordbank__answer-token';
      const scriptSpan = document.createElement('span');
      scriptSpan.className = 'si';
      scriptSpan.textContent = entry.mapping.si;
      const translit = document.createElement('small');
      translit.className = 'translit';
      translit.textContent = entry.mapping.translit;
      wrapper.appendChild(scriptSpan);
      wrapper.appendChild(translit);
      answerContainer.appendChild(wrapper);
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
    const correct = Array.isArray(currentSentence.tokens) ? currentSentence.tokens : [];
    const success =
      attempt.length === correct.length &&
      attempt.every((word, index) => word === correct[index]);

    if (success) {
      setFeedback('✅ Correct!');
    } else {
      const correctSinhala = correct
        .map((token) => getMappingForToken(unit, token).si)
        .join(' ');
      setFeedback(`❌ Correct order: ${correctSinhala}`);
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

function createTileEntry(unit, token, id, explicitWord = null) {
  const mapping = getMappingForToken(unit, token, explicitWord);
  const text = typeof token === 'string' && token ? token : mapping.translit || mapping.si || token || id;
  return {
    id,
    text,
    mapping,
    used: false,
  };
}

function getMappingForToken(unit, token, explicitWord = null) {
  const fallback = getVocabEntry(token);
  const wordEntry = explicitWord || getWordEntryFromUnit(unit, token);
  if (!wordEntry) {
    return fallback;
  }
  const script = wordEntry.si || fallback.si || fallback.translit || token || '';
  const transliteration = wordEntry.translit || wordEntry.token || fallback.translit || fallback.si || token || '';
  return {
    si: script,
    translit: transliteration,
  };
}
