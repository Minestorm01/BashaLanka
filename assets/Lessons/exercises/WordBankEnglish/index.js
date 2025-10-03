import { ensureStylesheet, resolveLessonAssetPath } from '../_shared/utils.js';
import {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  getWordEntryFromUnit,
} from '../_shared/wordBankUtils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="wordbank-english"]';
const STYLESHEET_ID = 'wordbank-english-styles';
const MIN_TOTAL_TILES = 6;
const MAX_FILLER_TILES = 4;
const DEFAULT_FILLER_WORDS = [
  'am',
  'is',
  'are',
  'the',
  'my',
  'me',
  'your',
  'her',
  'him',
  'our',
  'they',
  'we',
  'thank',
  'please',
  'good',
];

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
  let currentCorrectWords = [];
  let currentCorrectNormalised = [];
  let tileIdCounter = 0;

  function setSentence(sentence) {
    currentSentence = sentence;
    if (!sentence) return;

    tileIdCounter = 0;
    renderPrompt(promptContainer, sentence, unit);

    const targetWords = deriveTargetWords(sentence);
    const fallbackWords = deriveWordsFromTokens(sentence, unit);
    const baseWords = targetWords.length ? targetWords : fallbackWords;

    currentCorrectWords = baseWords.slice();
    currentCorrectNormalised = currentCorrectWords.map(normaliseWord);

    const baseTiles = baseWords.map((word) => createTile(word));

    const fillerTiles = createFillerTiles({
      unit,
      baseTiles,
      targetSet: new Set(currentCorrectNormalised),
    });

    tiles = shuffle([...baseTiles, ...fillerTiles]);
    answer = [];

    updateTiles();
    updateAnswer();
    setFeedback('');
  }

  function renderPrompt(containerEl, sentence, activeUnit) {
    if (!containerEl) {
      return;
    }

    containerEl.innerHTML = '';
    if (!sentence) {
      return;
    }

    const wrapperEl = document.createElement('div');
    wrapperEl.className = 'wordbank__prompt-wrapper';

    const bubbleEl = document.createElement('div');
    bubbleEl.className = 'wordbank__prompt-bubble';

    const siParts = sentence.tokens.map(
      (token) => getWordEntryFromUnit(activeUnit, token)?.si || token,
    );
    const siLine = document.createElement('p');
    siLine.className = 'wordbank__prompt-si';
    siLine.setAttribute('lang', 'si');
    siLine.textContent = siParts.join(' ');
    bubbleEl.appendChild(siLine);

    const translitParts = sentence.tokens.map(
      (token) => getWordEntryFromUnit(activeUnit, token)?.translit || '',
    );
    const translitText = translitParts.join(' ').trim();
    if (translitText) {
      const translitLine = document.createElement('p');
      translitLine.className = 'wordbank__prompt-translit';
      translitLine.setAttribute('lang', 'en');
      translitLine.textContent = translitText;
      bubbleEl.appendChild(translitLine);
    }

    wrapperEl.appendChild(bubbleEl);

    const illustrationSrc = resolveUnitIllustrationSrc(activeUnit);
    if (illustrationSrc) {
      const illustration = document.createElement('img');
      illustration.className = 'wordbank__unit-illustration';
      illustration.src = illustrationSrc;
      illustration.alt = '';
      illustration.setAttribute('role', 'presentation');
      wrapperEl.appendChild(illustration);
    }

    containerEl.appendChild(wrapperEl);
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
    const attemptNormalised = attempt.map(normaliseWord);

    if (arraysEqual(attemptNormalised, currentCorrectNormalised)) {
      setFeedback('✅ Correct!', 'correct');
    } else {
      const correctText = typeof currentSentence.text === 'string'
        && currentSentence.text.trim()
        ? currentSentence.text.trim()
        : currentCorrectWords.join(' ');
      setFeedback(`❌ Correct: ${correctText}`, 'incorrect');
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

  function createTile(text) {
    const label = text || '';
    return {
      id: `tile-${tileIdCounter += 1}`,
      text: label,
      used: false,
    };
  }

  function createFillerTiles({ unit: sourceUnit, baseTiles, targetSet }) {
    const baseCount = baseTiles.length;
    const candidateWords = gatherFillerWords(sourceUnit, targetSet);
    const desiredTotal = Math.max(MIN_TOTAL_TILES, baseCount + 2);
    const fillerTarget = Math.max(0, desiredTotal - baseCount);
    const fillerCount = Math.min(MAX_FILLER_TILES, fillerTarget, candidateWords.length);
    if (fillerCount <= 0) {
      return [];
    }

    const selected = shuffle(candidateWords).slice(0, fillerCount);
    return selected.map((word) => createTile(word));
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

function resolveUnitIllustrationSrc(unit) {
  const sectionNumber = deriveSectionNumber(unit);
  const unitNumber = deriveUnitNumber(unit);
  if (!sectionNumber || !unitNumber) {
    return null;
  }

  const sectionPart = `section${sectionNumber}`;
  const unitPart = `unit_${unitNumber}`;
  const relativePath = `assets/general/${sectionPart}_${unitPart}.svg`;
  return resolveLessonAssetPath(relativePath);
}

function deriveSectionNumber(unit) {
  if (!unit) {
    return null;
  }

  const direct = toPositiveInteger(unit.sectionNumber);
  if (direct) {
    return direct;
  }

  const candidates = [unit.sectionId, unit.sectionKey];
  for (let index = 0; index < candidates.length; index += 1) {
    const parsed = parseSectionNumberFromString(candidates[index]);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function deriveUnitNumber(unit) {
  if (!unit) {
    return null;
  }

  const direct = toPositiveInteger(unit.number);
  if (direct) {
    return direct;
  }

  const candidates = [unit.slug, unit.id];
  for (let index = 0; index < candidates.length; index += 1) {
    const parsed = parseUnitNumberFromString(candidates[index]);
    if (parsed) {
      return parsed;
    }
  }

  return null;
}

function toPositiveInteger(value) {
  if (value == null || value === '') {
    return null;
  }
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) {
    return null;
  }
  const rounded = Math.floor(number);
  return rounded > 0 ? rounded : null;
}

function parseSectionNumberFromString(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/section[-_ ]?0*(\d+)/i);
  if (match) {
    return toPositiveInteger(match[1]);
  }
  return null;
}

function parseUnitNumberFromString(value) {
  if (!value) {
    return null;
  }
  const first = String(value).match(/unit[-_ ]?0*(\d+)/i);
  if (first) {
    return toPositiveInteger(first[1]);
  }
  const compact = String(value).match(/u(\d+)/i);
  if (compact) {
    return toPositiveInteger(compact[1]);
  }
  return null;
}

function deriveTargetWords(sentence) {
  if (!sentence || typeof sentence.text !== 'string') {
    return [];
  }

  const normalisedText = normaliseSentenceText(sentence.text);
  if (!normalisedText) {
    return [];
  }

  return normalisedText.split(' ').filter(Boolean);
}

function normaliseSentenceText(text) {
  if (!text) {
    return '';
  }

  const unifiedQuotes = text
    .replace(/[“”]/g, '"')
    .replace(/[’]/g, "'");

  const words = unifiedQuotes
    .split(/\s+/)
    .map((word) => cleanWord(word))
    .filter(Boolean);

  return words.join(' ');
}

function cleanWord(value) {
  if (!value) {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const cleaned = trimmed
    .replace(/^[^A-Za-z0-9']+/g, '')
    .replace(/[^A-Za-z0-9']+$/g, '');

  return cleaned;
}

function normaliseWord(value) {
  return cleanWord(value).toLowerCase();
}

function deriveWordsFromTokens(sentence, unit) {
  if (!sentence || !Array.isArray(sentence.tokens)) {
    return [];
  }

  const words = sentence.tokens
    .map((token) => {
      const entry = getWordEntryFromUnit(unit, token);
      const english = extractWordBankEnglish(entry);
      if (!english) {
        return cleanWord(token);
      }

      const parts = splitEnglishIntoWords(english);
      if (parts.length) {
        return parts[0];
      }
      return cleanWord(english) || english;
    })
    .join(' ');

  return normaliseSentenceText(words).split(' ').filter(Boolean);
}

function extractWordBankEnglish(entry) {
  if (!entry) {
    return '';
  }

  if (entry.wordBankEn) {
    return entry.wordBankEn;
  }

  if (entry.wordbankEn) {
    return entry.wordbankEn;
  }

  let english = entry.en || '';
  if (!english && entry.si) {
    english = entry.si;
  }

  return english;
}

function splitEnglishIntoWords(value) {
  if (!value) {
    return [];
  }

  const withoutParens = value.replace(/\([^)]*\)/g, ' ');
  const segments = withoutParens.split(/(?:\s*[/;,]|\bor\b)/i);
  const words = [];

  segments.forEach((segment) => {
    const trimmed = segment.trim();
    if (!trimmed) {
      return;
    }

    trimmed
      .split(/\s+/)
      .map((part) => cleanWord(part))
      .filter(Boolean)
      .forEach((part) => words.push(part));
  });

  return words;
}

function gatherFillerWords(unit, targetSet) {
  const seen = new Map();
  const addWord = (word) => {
    const cleaned = cleanWord(word);
    if (!cleaned) {
      return;
    }
    const normalised = normaliseWord(cleaned);
    if (!normalised || targetSet.has(normalised) || seen.has(normalised)) {
      return;
    }
    seen.set(normalised, cleaned);
  };

  const entries = Array.isArray(unit?.vocab) ? unit.vocab : [];
  entries.forEach((entry) => {
    const english = extractWordBankEnglish(entry);
    const parts = splitEnglishIntoWords(english);
    if (!parts.length && english) {
      addWord(english);
      return;
    }
    parts.forEach((part) => addWord(part));
  });

  DEFAULT_FILLER_WORDS.forEach((word) => addWord(word));

  return Array.from(seen.entries()).map(([normalised, display]) => {
    if (normalised === 'i') {
      return 'I';
    }
    return display;
  });
}

