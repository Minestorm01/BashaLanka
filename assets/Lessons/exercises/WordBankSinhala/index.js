import {
  ensureStylesheet,
  normaliseText,
  setStatusMessage,
  shuffle,
} from '../_shared/utils.js';
import { fetchAllLessonVocabsUpTo } from '../TranslateToBase/index.js';
import {
  loadSectionSentenceData,
  flattenSectionSentences,
  collectUnitVocab,
} from '../_shared/sentence-loader.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank-sinhala"]';
const STYLESHEET_ID = 'word-bank-shared-styles';
const SECTION_ID = 'section-01-introductions';
const MIN_WORD_PROMPT = 3;
const MAX_DISTRACTOR_TILES = 6;

function removeDiacritics(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normaliseTokenKey(value) {
  if (value === null || value === undefined) return '';
  const cleaned = removeDiacritics(
    normaliseText(value)
      .replace(/\[[^\]]*\]/g, '')
      .replace(/[{}]/g, '')
      .replace(/[_]+/g, ' ')
  );
  return cleaned
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function generateTokenVariants(value) {
  const base = normaliseTokenKey(value);
  const variants = new Set();
  if (base) variants.add(base);
  if (base.endsWith('yi')) {
    variants.add(base.slice(0, -1));
  }
  if (base.includes('_')) {
    variants.add(base.replace(/_/g, ''));
  }
  return Array.from(variants).filter(Boolean);
}

function parseLessonNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const text = value.toString();
  const direct = Number.parseInt(text, 10);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const match = text.match(/lesson[-_\s]?(\d+)/i);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function parseUnitNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const text = value.toString();
  const direct = Number.parseInt(text, 10);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const match = text.match(/unit[-_\s]?(\d+)/i) || text.match(/u(\d+)/i);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function parseSectionNumber(value) {
  if (!value) return null;
  const text = value.toString();
  const direct = Number.parseInt(text, 10);
  if (Number.isFinite(direct) && direct > 0) {
    return direct;
  }
  const match = text.match(/section[-_\s]?(\d+)/i);
  if (match) {
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function resolveLessonNumber(context = {}) {
  const meta = context.meta || {};
  const detail = context.detail || {};
  return (
    parseLessonNumber(detail.lessonNumber) ||
    parseLessonNumber(meta.lessonNumber) ||
    parseLessonNumber(detail.lessonId) ||
    parseLessonNumber(meta.lessonId) ||
    parseLessonNumber(detail.lessonPath) ||
    null
  );
}

function resolveUnitNumber(context = {}) {
  const meta = context.meta || {};
  const detail = context.detail || {};
  const fromPath = parseUnitNumber(detail.lessonPath || meta.lessonPath || '');
  return (
    parseUnitNumber(detail.unitNumber) ||
    parseUnitNumber(meta.unitNumber) ||
    parseUnitNumber(detail.unitId) ||
    parseUnitNumber(meta.unitId) ||
    fromPath ||
    null
  );
}

function resolveMascotSrc() {
  const lessonContext = window.BashaLanka?.currentLesson || {};
  const detail = lessonContext.detail || {};
  const meta = lessonContext.meta || {};
  let mascotSrc = detail.mascot || meta.mascot;
  const sectionNumber =
    detail.sectionNumber ||
    meta.sectionNumber ||
    parseSectionNumber(detail.sectionId) ||
    parseSectionNumber(meta.sectionId);
  if (!mascotSrc && sectionNumber) {
    mascotSrc = `assets/sections/section-${sectionNumber}/mascot.svg`;
  }
  if (!mascotSrc) {
    mascotSrc = 'assets/sections/section-1/mascot.svg';
  }
  return mascotSrc;
}

function splitWords(value) {
  return normaliseText(value)
    .split(/\s+/)
    .map((part) => part.replace(/[“”"'`]+/g, ''))
    .filter(Boolean);
}

function cleanSinhalaWord(value) {
  return normaliseText(value).replace(/^["'“”‘’]+|["'“”‘’]+$/g, '');
}

function buildTokenDictionary(vocabEntries = [], unitVocab = []) {
  const dictionary = new Map();
  const register = (key, data) => {
    if (!key) return;
    if (!dictionary.has(key)) {
      dictionary.set(key, data);
    } else {
      const existing = dictionary.get(key);
      dictionary.set(key, {
        ...existing,
        ...data,
        script: existing.script || data.script,
        transliteration: existing.transliteration || data.transliteration,
      });
    }
  };

  vocabEntries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const transliteration = normaliseText(entry.translit || entry.transliteration || '');
    if (!transliteration) return;
    const sinhala = normaliseText(entry.si || entry.sinhala || '');
    const english = normaliseText(entry.en || entry.english || '');
    const translitWords = splitWords(transliteration).map((word) =>
      word.replace(/\[[^\]]*\]/g, '')
    );
    const sinhalaWords = splitWords(sinhala).map(cleanSinhalaWord);
    translitWords.forEach((word, index) => {
      const variants = generateTokenVariants(word);
      const script = sinhalaWords[index] || sinhalaWords[sinhalaWords.length - 1] || '';
      variants.forEach((variant) => {
        register(variant, {
          key: variant,
          script,
          transliteration: normaliseText(word),
          english,
        });
      });
    });
  });

  unitVocab.forEach((token) => {
    const variants = generateTokenVariants(token);
    const display = normaliseText(token).replace(/_/g, ' ');
    variants.forEach((variant) => {
      register(variant, {
        key: variant,
        script: '',
        transliteration: display,
      });
    });
  });

  return dictionary;
}

function findDictionaryEntry(token, dictionary) {
  const variants = generateTokenVariants(token);
  for (const variant of variants) {
    if (dictionary.has(variant)) {
      return { key: variant, ...dictionary.get(variant) };
    }
  }
  const fallbackKey = variants[0] || normaliseTokenKey(token);
  const fallbackDisplay = normaliseText(token).replace(/_/g, ' ');
  return {
    key: fallbackKey,
    script: fallbackDisplay,
    transliteration: fallbackDisplay,
  };
}

function buildAvailableTokenSet(dictionary, unitVocabById, unitNumber) {
  const set = new Set();
  dictionary.forEach((_, key) => set.add(key));
  if (unitNumber && unitVocabById) {
    unitVocabById.forEach((tokens, id) => {
      if (Number(id) <= unitNumber) {
        tokens.forEach((token) => {
          generateTokenVariants(token).forEach((variant) => set.add(variant));
        });
      }
    });
  }
  return set;
}

function filterEligibleSentences(sentences, availableTokens, unitNumber) {
  return sentences.filter((sentence) => {
    const tokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
    if (!tokens.length) return false;
    const englishWordCount = normaliseText(sentence.text)
      .split(/\s+/)
      .filter(Boolean).length;
    if (tokens.length > 1 && englishWordCount < MIN_WORD_PROMPT) {
      return false;
    }
    if (sentence.minUnit && unitNumber && sentence.minUnit > unitNumber) {
      return false;
    }
    return tokens.every((token) =>
      generateTokenVariants(token).some((variant) => availableTokens.has(variant))
    );
  });
}

function prepareSentencePrompt(sentence) {
  const displayText = normaliseText(sentence.text || '')
    .replace(/\{[^}]+\}/g, '___')
    .trim();
  const evaluationText = normaliseText(sentence.text || '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { displayText, evaluationText };
}

function buildSinhalaTileData(sentence, dictionary) {
  const answerTokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
  const answerEntries = answerTokens.map((token) => findDictionaryEntry(token, dictionary));
  const answerKeys = answerEntries.map((entry) => entry.key);
  const answerKeySet = new Set(answerKeys);
  const distractorCandidates = [];
  dictionary.forEach((entry, key) => {
    if (!answerKeySet.has(key)) {
      distractorCandidates.push({ key, ...entry });
    }
  });
  const extraTiles = shuffle(distractorCandidates).slice(0, MAX_DISTRACTOR_TILES);
  const tiles = shuffle(
    answerEntries
      .map((entry, index) => ({
        id: `a-${index}-${entry.key}`,
        ...entry,
        isAnswer: true,
      }))
      .concat(
        extraTiles.map((entry, index) => ({
          id: `d-${index}-${entry.key}`,
          ...entry,
          isAnswer: false,
        }))
      )
  );
  return { tiles, answerKeys };
}

function createTileElement({ id, script, transliteration }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank__tile';
  button.dataset.tileId = id;

  const scriptEl = document.createElement('span');
  scriptEl.className = 'word-bank__tile-script';
  scriptEl.textContent = script || transliteration;
  button.appendChild(scriptEl);

  if (transliteration && transliteration !== script) {
    const helper = document.createElement('span');
    helper.className = 'word-bank__tile-helper';
    helper.textContent = transliteration;
    button.appendChild(helper);
  }

  return button;
}

function createAssembledTile({ id, script, transliteration }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank__assembled-tile';
  button.dataset.tileId = id;

  const scriptEl = document.createElement('span');
  scriptEl.className = 'word-bank__tile-script';
  scriptEl.textContent = script || transliteration;
  button.appendChild(scriptEl);

  if (transliteration && transliteration !== script) {
    const helper = document.createElement('span');
    helper.className = 'word-bank__tile-helper';
    helper.textContent = transliteration;
    button.appendChild(helper);
  }

  return button;
}

function buildLayout({ prompt, subPrompt = '', placeholder, variant = 'word-bank--sinhala' }) {
  const wrapper = document.createElement('section');
  wrapper.className = `word-bank ${variant}`;

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
  mascot.src = resolveMascotSrc();
  mascot.alt = 'Lesson mascot';
  headerMain.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank__bubble';
  headerMain.appendChild(bubble);

  const promptEl = document.createElement('p');
  promptEl.className = 'word-bank__prompt';
  promptEl.textContent = prompt;
  bubble.appendChild(promptEl);

  if (subPrompt) {
    const subPromptEl = document.createElement('p');
    subPromptEl.className = 'word-bank__subprompt';
    subPromptEl.textContent = subPrompt;
    bubble.appendChild(subPromptEl);
  }

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  assembled.setAttribute('role', 'list');
  assembled.setAttribute('aria-live', 'polite');
  bubble.appendChild(assembled);

  const placeholderEl = document.createElement('span');
  placeholderEl.className = 'word-bank__assembled-placeholder';
  placeholderEl.textContent = placeholder;
  assembled.appendChild(placeholderEl);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  bubble.appendChild(feedback);

  const tilesContainer = document.createElement('div');
  tilesContainer.className = 'word-bank__tiles';
  surface.appendChild(tilesContainer);

  const actions = document.createElement('div');
  actions.className = 'word-bank__actions';
  surface.appendChild(actions);

  const resetButton = document.createElement('button');
  resetButton.type = 'button';
  resetButton.className = 'word-bank__button word-bank__button--secondary';
  resetButton.textContent = 'Reset';
  actions.appendChild(resetButton);

  const checkButton = document.createElement('button');
  checkButton.type = 'button';
  checkButton.className = 'word-bank__button word-bank__button--primary';
  checkButton.textContent = 'Check';
  checkButton.disabled = true;
  actions.appendChild(checkButton);

  return {
    wrapper,
    tilesContainer,
    assembled,
    placeholderEl,
    feedback,
    checkButton,
    resetButton,
  };
}

function updateCheckState(checkButton, selected) {
  if (checkButton) {
    checkButton.disabled = !selected.length;
  }
}

function clearAssembled(assembled) {
  if (!assembled) return;
  assembled.innerHTML = '';
}

async function loadSentencePool() {
  const sectionData = await loadSectionSentenceData(SECTION_ID, { baseUrl: import.meta.url });
  const sentences = flattenSectionSentences(sectionData, SECTION_ID);
  const vocabByUnit = collectUnitVocab(sectionData);
  return { sentences, vocabByUnit };
}

function compareSequences(candidate, expected) {
  if (candidate.length !== expected.length) return false;
  return candidate.every((value, index) => value === expected[index]);
}

export async function initWordBankSinhala(options = {}) {
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

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  const context = window.BashaLanka?.currentLesson || {};
  const lessonNumber = resolveLessonNumber(context);
  const unitNumber = resolveUnitNumber(context);
  if (!lessonNumber) {
    throw new Error('Unable to resolve lesson number for WordBankSinhala.');
  }

  const [vocabEntries, sentencePool] = await Promise.all([
    fetchAllLessonVocabsUpTo(lessonNumber),
    loadSentencePool(),
  ]);

  const unitVocabById = sentencePool.vocabByUnit;
  const unitVocab = [];
  if (unitNumber && unitVocabById) {
    unitVocabById.forEach((tokens, id) => {
      if (Number(id) <= unitNumber) {
        unitVocab.push(...tokens);
      }
    });
  }

  const dictionary = buildTokenDictionary(vocabEntries, unitVocab);
  const availableTokens = buildAvailableTokenSet(dictionary, unitVocabById, unitNumber || Infinity);
  const eligibleSentences = filterEligibleSentences(
    sentencePool.sentences,
    availableTokens,
    unitNumber || Infinity
  );

  if (!eligibleSentences.length) {
    throw new Error('No eligible Sinhala word bank sentences for the current lesson.');
  }

  const sentence = eligibleSentences[Math.floor(Math.random() * eligibleSentences.length)];
  const { tiles, answerKeys } = buildSinhalaTileData(sentence, dictionary);
  const { displayText, evaluationText } = prepareSentencePrompt(sentence);

  const {
    wrapper,
    tilesContainer,
    assembled,
    placeholderEl,
    feedback,
    checkButton,
    resetButton,
  } = buildLayout({
    prompt: displayText,
    placeholder: 'Tap tiles to build the Sinhala sentence.',
    variant: 'word-bank--sinhala',
  });

  target.innerHTML = '';
  target.appendChild(wrapper);

  const tileState = new Map();
  const selected = [];

  const handleTileSelect = (tile) => {
    if (tileState.get(tile.id)?.selected) return;
    tileState.set(tile.id, { ...tile, selected: true });
    selected.push(tile);
    const assembledTile = createAssembledTile(tile);
    assembledTile.addEventListener('click', () => {
      const index = selected.findIndex((item) => item.id === tile.id);
      if (index !== -1) {
        selected.splice(index, 1);
        tileState.set(tile.id, { ...tile, selected: false });
        assembledTile.remove();
        const originalButton = tilesContainer.querySelector(
          `.word-bank__tile[data-tile-id="${CSS.escape(tile.id)}"]`
        );
        if (originalButton) {
          originalButton.disabled = false;
          originalButton.classList.remove('word-bank__tile--disabled');
        }
        if (!selected.length && placeholderEl) {
          placeholderEl.hidden = false;
        }
        updateCheckState(checkButton, selected);
      }
    });
    assembled.appendChild(assembledTile);
    if (placeholderEl) {
      placeholderEl.hidden = true;
    }
    const originalButton = tilesContainer.querySelector(
      `.word-bank__tile[data-tile-id="${CSS.escape(tile.id)}"]`
    );
    if (originalButton) {
      originalButton.disabled = true;
      originalButton.classList.add('word-bank__tile--disabled');
    }
    updateCheckState(checkButton, selected);
  };

  tiles.forEach((tile) => {
    const button = createTileElement(tile);
    tileState.set(tile.id, { ...tile, selected: false });
    button.addEventListener('click', () => handleTileSelect(tile));
    tilesContainer.appendChild(button);
  });

  resetButton.addEventListener('click', () => {
    selected.splice(0, selected.length);
    tileState.forEach((tile, id) => {
      tileState.set(id, { ...tile, selected: false });
    });
    clearAssembled(assembled);
    if (placeholderEl) {
      placeholderEl.hidden = false;
      assembled.appendChild(placeholderEl);
    }
    tilesContainer.querySelectorAll('.word-bank__tile').forEach((button) => {
      button.disabled = false;
      button.classList.remove('word-bank__tile--disabled');
    });
    setStatusMessage(feedback, 'Tap tiles to build the Sinhala sentence.', 'neutral');
    updateCheckState(checkButton, selected);
  });

  checkButton.addEventListener('click', () => {
    if (!selected.length) return;
    const candidate = selected.map((tile) => tile.key);
    if (compareSequences(candidate, answerKeys)) {
      setStatusMessage(feedback, 'Correct! Great job building the Sinhala sentence.', 'success');
      checkButton.disabled = true;
      resetButton.disabled = true;
      tilesContainer.querySelectorAll('.word-bank__tile').forEach((button) => {
        button.disabled = true;
        button.classList.add('word-bank__tile--disabled');
      });
      if (typeof onComplete === 'function') {
        onComplete({ sentence, answer: evaluationText });
      }
    } else {
      setStatusMessage(feedback, 'Not quite, try again.', 'error');
    }
  });

  setStatusMessage(feedback, 'Tap tiles to build the Sinhala sentence.', 'neutral');

  return {
    sentence,
    tiles,
    answerKeys,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBankSinhala = initWordBankSinhala;
}

export default initWordBankSinhala;

