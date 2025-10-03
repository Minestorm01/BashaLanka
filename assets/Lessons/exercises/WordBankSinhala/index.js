import { ensureStylesheet, resolveLessonAssetPath } from '../_shared/utils.js';
import {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  getWordEntryFromUnit,
} from '../_shared/wordBankUtils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="wordbank-sinhala"]';
const STYLESHEET_ID = 'wordbank-sinhala-styles';
const MIN_TOTAL_TILES = 6;
const MAX_FILLER_TILES = 4;
const DEFAULT_FILLER_WORDS = [
  { text: 'මම', translit: 'mama' },
  { text: 'ඔයා', translit: 'oya' },
  { text: 'ඔහු', translit: 'ohu' },
  { text: 'ඇය', translit: 'eya' },
  { text: 'අපි', translit: 'api' },
  { text: 'ඔවුන්', translit: 'owun' },
  { text: 'ඔව්', translit: 'owu' },
  { text: 'නෑ', translit: 'nae' },
  { text: 'හොඳයි', translit: 'hondai' },
  { text: 'කරුණාකර', translit: 'karunaa kara' },
  { text: 'ස්තූතියි', translit: 'sthuthiyi' },
  { text: 'ආයුබෝවන්', translit: 'aayubowan' },
  { text: 'රට', translit: 'rata' },
  { text: 'සිංහල', translit: 'sinhala' },
  { text: 'ඉංග්‍රීසි', translit: 'inggrisi' },
  { text: 'ද?', translit: 'da?' },
];

export default async function initWordBankSinhalaExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBankSinhala requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    onComplete,
    unitId: providedUnitId,
  } = options;

  if (!target) return;

  ensureStylesheet(STYLESHEET_ID, '../WordBankEnglish/styles.css', { baseUrl: import.meta.url });

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
  wrapper.className = 'wordbank wordbank--sinhala';

  const promptContainer = document.createElement('div');
  promptContainer.className = 'wordbank__prompt';
  wrapper.appendChild(promptContainer);

  const instruction = document.createElement('p');
  instruction.className = 'wordbank__instruction';
  instruction.textContent = 'Arrange the Sinhala tiles to match the English sentence.';
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
    const profileName = getProfileName();
    renderPrompt(promptContainer, sentence, unit, { profileName });

    const correctTokens = deriveCorrectTokens(sentence, unit, { profileName });
    currentCorrectWords = correctTokens.map((token) => token.text);
    currentCorrectNormalised = correctTokens.map((token) => token.normalised);

    const baseTiles = correctTokens.map((token) => createTile(token));

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

  function renderPrompt(containerEl, sentence, activeUnit, { profileName } = {}) {
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

    const englishLine = document.createElement('p');
    englishLine.className = 'wordbank__prompt-en';
    englishLine.setAttribute('lang', 'en');
    englishLine.textContent = fillNamePlaceholder(sentence.text || '', profileName);
    bubbleEl.appendChild(englishLine);

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
      populateTileButton(btn, tile);
      btn.disabled = tile.used;
      applyTileAccessibility(btn, tile);
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
      populateTileButton(tokenBtn, tile);
      applyTileAccessibility(tokenBtn, tile);
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

  function populateTileButton(buttonEl, tile) {
    buttonEl.innerHTML = '';

    const label = document.createElement('span');
    label.className = 'wordbank__tile-text';
    label.textContent = tile.text;
    label.setAttribute('lang', detectLangTag(tile.text));
    buttonEl.appendChild(label);

    if (tile.translit) {
      const translit = document.createElement('span');
      translit.className = 'wordbank__tile-translit';
      translit.textContent = tile.translit;
      translit.setAttribute('lang', detectLangTag(tile.translit, 'si-Latn'));
      buttonEl.appendChild(translit);
    }
  }

  function applyTileAccessibility(buttonEl, tile) {
    if (tile.translit) {
      buttonEl.setAttribute('aria-label', `${tile.text} (${tile.translit})`);
      buttonEl.title = tile.translit;
    } else {
      buttonEl.setAttribute('aria-label', tile.text);
      buttonEl.removeAttribute('title');
    }
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
    const attemptNormalised = answer.map((a) => a.normalised);

    if (arraysEqual(attemptNormalised, currentCorrectNormalised)) {
      setFeedback('✅ Correct!', 'correct', 'en');
    } else {
      const correctText = currentCorrectWords.join(' ');
      setFeedback(`❌ Correct: ${correctText}`, 'incorrect', 'si');
    }
  }

  function handleNext() {
    const next = randomItem(sentences.filter((s) => s !== currentSentence));
    setSentence(next || randomItem(sentences));
  }

  checkBtn.addEventListener('click', handleCheck);
  nextBtn.addEventListener('click', handleNext);

  setSentence(randomItem(sentences));

  function setFeedback(message, state, lang) {
    feedback.textContent = message;
    if (state) {
      feedback.setAttribute('data-state', state);
    } else {
      feedback.removeAttribute('data-state');
    }
    if (lang) {
      feedback.setAttribute('lang', lang);
    } else {
      feedback.removeAttribute('lang');
    }
  }

  function createTile({ text, translit }) {
    const label = text || '';
    return {
      id: `tile-${(tileIdCounter += 1)}`,
      text: label,
      translit: translit || '',
      used: false,
      normalised: normaliseWord(label),
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

function deriveCorrectTokens(sentence, unit, { profileName } = {}) {
  if (!sentence || !Array.isArray(sentence.tokens)) {
    return [];
  }

  const derived = sentence.tokens
    .map((token) => {
      const entry = getWordEntryFromUnit(unit, token);
      const text = extractSinhala(entry) || cleanWord(token);
      if (!text) {
        return null;
      }
      const translit = entry?.translit || entry?.transliteration || '';
      return {
        token,
        text,
        translit,
        normalised: normaliseWord(text),
      };
    })
    .filter(Boolean);

  if (!profileName || !hasNamePlaceholder(sentence)) {
    return derived.map(stripTokenMeta);
  }

  const normalisedProfile = normaliseWord(profileName);
  if (!normalisedProfile) {
    return derived.map(stripTokenMeta);
  }

  const insertionIndex = determineNameInsertionIndex(derived);
  const profileToken = {
    token: '__profile_name__',
    text: profileName,
    translit: profileName,
    normalised: normalisedProfile,
  };
  derived.splice(insertionIndex, 0, profileToken);

  return derived.map(stripTokenMeta);
}

function gatherFillerWords(unit, targetSet) {
  const seen = new Map();
  const addWord = (word, translit = '') => {
    const cleaned = cleanWord(word);
    if (!cleaned) {
      return;
    }
    const normalised = normaliseWord(cleaned);
    if (!normalised || targetSet.has(normalised) || seen.has(normalised)) {
      return;
    }
    seen.set(normalised, { text: cleaned, translit });
  };

  const entries = Array.isArray(unit?.vocab) ? unit.vocab : [];
  entries.forEach((entry) => {
    const text = extractSinhala(entry);
    if (!text || containsNamePlaceholder(text) || containsNamePlaceholder(entry?.translit) || containsNamePlaceholder(entry?.en)) {
      return;
    }
    const translit = entry?.translit || entry?.transliteration || '';
    addWord(text, translit);
  });

  DEFAULT_FILLER_WORDS.forEach((entry) => {
    if (!entry) {
      return;
    }
    if (typeof entry === 'string') {
      if (!containsNamePlaceholder(entry)) {
        addWord(entry);
      }
      return;
    }
    if (!containsNamePlaceholder(entry.text) && !containsNamePlaceholder(entry.translit) && !containsNamePlaceholder(entry.transliteration)) {
      addWord(entry.text, entry.translit || entry.transliteration || '');
    }
  });

  return Array.from(seen.values());
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

function extractSinhala(entry) {
  if (!entry) {
    return '';
  }
  if (entry.si) {
    return entry.si;
  }
  if (entry.wordBankSi) {
    return entry.wordBankSi;
  }
  return entry.wordbankSi || '';
}

function hasNamePlaceholder(sentence) {
  if (!sentence) {
    return false;
  }
  const haystacks = [];
  if (typeof sentence.text === 'string') {
    haystacks.push(sentence.text);
  }
  if (Array.isArray(sentence.tokens)) {
    haystacks.push(sentence.tokens.join(' '));
  }
  return haystacks.some((value) => containsNamePlaceholder(value));
}

function containsNamePlaceholder(value) {
  if (!value) {
    return false;
  }
  return /\{\s*name\s*\}/i.test(value) || /\[\s*name\s*\]/i.test(value);
}

function determineNameInsertionIndex(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) {
    return 0;
  }

  const nameLikeIndex = tokens.findIndex((token) => /name/i.test(token.token || ''));
  if (nameLikeIndex >= 0) {
    return nameLikeIndex + 1;
  }

  const possessiveIndex = tokens.findIndex((token) => /mage/i.test(token.token || ''));
  if (possessiveIndex >= 0) {
    return possessiveIndex + 1;
  }

  return tokens.length;
}

function stripTokenMeta({ text, translit, normalised }) {
  return { text, translit, normalised };
}

function getProfileName() {
  const profile = typeof window !== 'undefined' ? window.__APP__?.AppState?.user : null;
  const username = profile?.username;
  if (typeof username !== 'string') {
    return '';
  }
  return username.trim();
}

function fillNamePlaceholder(text, profileName) {
  if (!text || !profileName) {
    return text;
  }
  return text.replace(/\{\s*name\s*\}/gi, profileName);
}

function detectLangTag(value, fallback = 'si') {
  if (!value) {
    return fallback;
  }
  if (/[\u0D80-\u0DFF]/.test(value)) {
    return 'si';
  }
  if (/^[\p{L}\p{M}\p{N}\s'.-]+$/u.test(value)) {
    return 'si-Latn';
  }
  return fallback;
}

function cleanWord(value) {
  if (!value) {
    return '';
  }
  const trimmed = value
    .toString()
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.replace(/^[\s\p{P}\p{S}]+|[\s\p{P}\p{S}]+$/gu, '');
}

function normaliseWord(value) {
  if (!value) {
    return '';
  }
  const cleaned = cleanWord(value);
  if (!cleaned) {
    return '';
  }
  const normalized = typeof cleaned.normalize === 'function'
    ? cleaned.normalize('NFC')
    : cleaned;
  return normalized.replace(/\s+/g, ' ');
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
