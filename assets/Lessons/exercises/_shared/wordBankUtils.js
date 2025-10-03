const SENTENCES_URL = new URL('../../sections/section-01-introductions/sentences.yaml', import.meta.url);
const WORDS_URL = new URL('../../sections/section-01-introductions/words.yaml', import.meta.url);

let cachedUnitsPromise = null;
let cachedWordBankUnitsPromise = null;
let cachedWordEntriesPromise = null;

export function shuffleArray(input) {
  const array = Array.isArray(input) ? input.slice() : [];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function randomItem(array) {
  if (!Array.isArray(array) || array.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * array.length);
  return array[index] ?? null;
}

export async function loadWordBankUnits() {
  if (!cachedWordBankUnitsPromise) {
    cachedWordBankUnitsPromise = fetchWordBankUnits();
  }

  const units = await cachedWordBankUnitsPromise;
  return units.map((unit) => ({
    ...unit,
    sentences: unit.sentences.map((sentence) => ({
      ...sentence,
      tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
    })),
    vocab: unit.vocab.map((entry) => ({ ...entry })),
  }));
}

export function resolveActiveUnit(units, providedUnitId) {
  if (!Array.isArray(units) || units.length === 0) {
    return null;
  }

  const candidate = normaliseUnitId(providedUnitId);
  if (candidate) {
    const match = units.find((unit) => {
      const identifiers = [unit.id, unit.slug, unit.number != null ? String(unit.number) : null]
        .filter(Boolean)
        .map((value) => normaliseUnitId(value));
      return identifiers.includes(candidate);
    });
    if (match) {
      return match;
    }
  }

  if (typeof window !== 'undefined') {
    const currentUnit = window?.BashaLanka?.currentLesson?.detail?.unitId
      ?? window?.BashaLanka?.currentLesson?.meta?.unitId;
    const normalisedCurrent = normaliseUnitId(currentUnit);
    if (normalisedCurrent) {
      const match = units.find((unit) => {
        const identifiers = [unit.id, unit.slug, unit.number != null ? String(unit.number) : null]
          .filter(Boolean)
          .map((value) => normaliseUnitId(value));
        return identifiers.includes(normalisedCurrent);
      });
      if (match) {
        return match;
      }
    }
  }

  return units[0] ?? null;
}

export function getUnitSentences(unit) {
  if (!unit || !Array.isArray(unit.sentences)) {
    return [];
  }

  return unit.sentences.map((sentence) => ({
    ...sentence,
    tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
  }));
}

export function getWordEntryFromUnit(unit, token) {
  if (!unit || !token) {
    return null;
  }

  const normalisedToken = normaliseTokenKey(token);
  if (!normalisedToken) {
    return null;
  }

  let entry = null;
  if (unit.tokenMap instanceof Map && unit.tokenMap.has(normalisedToken)) {
    entry = unit.tokenMap.get(normalisedToken);
  }

  if (!entry && Array.isArray(unit.vocab)) {
    entry = unit.vocab.find((candidate) => {
      const keys = deriveCandidateKeys(candidate);
      return keys.includes(normalisedToken);
    }) || null;
  }

  if (!entry) {
    const fallback = token.toString().replace(/_/g, ' ');
    return {
      si: fallback,
      en: fallback,
      translit: fallback,
    };
  }

  const si = entry.si || token;
  const en = entry.en || si;
  const translit = entry.translit || entry.transliteration || token;

  return { si, en, translit };
}

export async function loadSectionSentences() {
  if (!cachedUnitsPromise) {
    cachedUnitsPromise = fetchSectionUnits();
  }
  const units = await cachedUnitsPromise;
  return units.map((unit) => ({
    id: unit.id,
    name: unit.name,
    vocab: Array.isArray(unit.vocab) ? unit.vocab.slice() : [],
    sentences: Array.isArray(unit.sentences)
      ? unit.sentences.map((sentence) => ({ ...sentence }))
      : [],
  }));
}

async function fetchSectionUnits() {
  if (typeof fetch !== 'function') {
    throw new Error('Fetching sentences requires a browser environment.');
  }

  const response = await fetch(SENTENCES_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error('Failed to load section sentences.');
  }

  const text = await response.text();
  return parseSectionYaml(text);
}

export function flattenSentences(units) {
  if (!Array.isArray(units)) {
    return [];
  }

  const sentences = [];
  units.forEach((unit) => {
    const vocab = Array.isArray(unit.vocab) ? unit.vocab : [];
    const unitSentences = Array.isArray(unit.sentences) ? unit.sentences : [];
    unitSentences.forEach((sentence) => {
      sentences.push({
        text: sentence.text || '',
        tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
        minUnit: sentence.minUnit ?? null,
        unit,
        unitVocab: vocab,
      });
    });
  });

  return sentences;
}

export function determineUnitId(candidate) {
  if (candidate == null) {
    if (typeof window !== 'undefined') {
      const lesson = window.BashaLanka && window.BashaLanka.currentLesson;
      const detailUnit = lesson?.detail?.unitId ?? lesson?.meta?.unitId;
      const numericDetail = Number(detailUnit);
      if (!Number.isNaN(numericDetail) && numericDetail > 0) {
        return numericDetail;
      }
    }
    return 1;
  }

  const numeric = Number(candidate);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return 1;
  }
  return numeric;
}

export function filterUnlockedSentences(sentences, unitId) {
  if (!Array.isArray(sentences)) {
    return [];
  }

  const resolvedUnitId = determineUnitId(unitId);
  return sentences.filter((sentence) => {
    if (!sentence) {
      return false;
    }

    const { minUnit } = sentence;
    if (minUnit == null || minUnit === '') {
      return true;
    }

    const numeric = Number(minUnit);
    if (Number.isNaN(numeric)) {
      return true;
    }

    return numeric <= resolvedUnitId;
  });
}

function parseSectionYaml(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const units = [];
  const lines = text.split(/\r?\n/);
  let currentUnit = null;
  let currentSentence = null;
  let mode = null;

  lines.forEach((line) => {
    if (!line) {
      return;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    if (trimmed.startsWith('- id:')) {
      const idValue = trimmed.replace(/^- id:\s*/, '').trim();
      const parsedId = Number(idValue) || idValue;
      currentUnit = {
        id: parsedId,
        name: '',
        vocab: [],
        sentences: [],
      };
      units.push(currentUnit);
      mode = null;
      currentSentence = null;
      return;
    }

    if (!currentUnit) {
      return;
    }

    if (trimmed.startsWith('name:')) {
      const value = trimmed.replace(/^name:\s*/, '').trim();
      currentUnit.name = stripQuotes(value);
      return;
    }

    if (trimmed === 'vocab:') {
      mode = 'vocab';
      currentSentence = null;
      return;
    }

    if (trimmed === 'sentences:') {
      mode = 'sentences';
      currentSentence = null;
      return;
    }

    if (mode === 'vocab' && trimmed.startsWith('- ')) {
      const vocabEntry = trimmed.replace(/^-\s*/, '');
      const cleaned = stripComment(vocabEntry);
      if (cleaned) {
        currentUnit.vocab.push(cleaned);
      }
      return;
    }

    if (mode === 'sentences') {
      if (trimmed.startsWith('- text:')) {
        const value = trimmed.replace(/^- text:\s*/, '');
        const textValue = parseQuotedValue(value);
        currentSentence = {
          text: textValue,
          tokens: [],
          minUnit: null,
        };
        currentUnit.sentences.push(currentSentence);
        return;
      }

      if (!currentSentence) {
        return;
      }

      if (trimmed.startsWith('tokens:')) {
        const tokenText = trimmed.replace(/^tokens:\s*/, '');
        currentSentence.tokens = parseArrayLiteral(tokenText);
        return;
      }

      if (trimmed.startsWith('minUnit:')) {
        const value = trimmed.replace(/^minUnit:\s*/, '').trim();
        const parsed = Number(value);
        currentSentence.minUnit = Number.isNaN(parsed) ? value : parsed;
        return;
      }
    }
  });

  return units;
}

function parseQuotedValue(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  if (firstChar === '"' && lastChar === '"') {
    try {
      return JSON.parse(trimmed);
    } catch (error) {
      return trimmed.slice(1, -1);
    }
  }
  if (firstChar === '\'' && lastChar === '\'') {
    const inner = trimmed.slice(1, -1);
    try {
      return JSON.parse(`"${inner.replace(/"/g, '\\"')}"`);
    } catch (error) {
      return inner;
    }
  }
  return stripQuotes(trimmed);
}

function parseArrayLiteral(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    return trimmed
      .replace(/^[\[]|[\]]$/g, '')
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }
}

function stripComment(value) {
  const noComment = value.replace(/\s+#.*$/, '');
  return stripQuotes(noComment.trim());
}

function stripQuotes(value) {
  if (!value) {
    return '';
  }
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith('\'') && trimmed.endsWith('\''))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function fetchWordBankUnits() {
  const [sentences, wordEntries] = await Promise.all([
    loadSectionSentences(),
    loadWordEntries(),
  ]);

  const sentencesByNumber = new Map();
  sentences.forEach((unit) => {
    const number = Number(unit.id);
    if (!Number.isNaN(number)) {
      sentencesByNumber.set(number, unit);
    }
  });

  const units = [];

  Object.entries(wordEntries).forEach(([slug, vocab]) => {
    const numberMatch = /unit-(\d+)/i.exec(slug);
    const number = numberMatch ? Number(numberMatch[1]) : null;
    const sentenceUnit = number != null ? sentencesByNumber.get(number) : null;
    const name = sentenceUnit?.name || slug;

    units.push({
      id: slug,
      slug,
      number,
      name,
      sentences: Array.isArray(sentenceUnit?.sentences)
        ? sentenceUnit.sentences.map((sentence) => ({
            text: sentence.text || '',
            tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
            minUnit: sentence.minUnit ?? null,
          }))
        : [],
      vocab: Array.isArray(vocab) ? vocab.map((entry) => ({ ...entry })) : [],
      tokenMap: buildTokenMap(vocab),
    });
  });

  sentences.forEach((sentenceUnit) => {
    const number = Number(sentenceUnit.id);
    const exists = units.some((unit) => unit.number === number || unit.slug === sentenceUnit.id);
    if (!exists) {
      units.push({
        id: sentenceUnit.id,
        slug: String(sentenceUnit.id),
        number,
        name: sentenceUnit.name || String(sentenceUnit.id),
        sentences: Array.isArray(sentenceUnit.sentences)
          ? sentenceUnit.sentences.map((sentence) => ({
              text: sentence.text || '',
              tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
              minUnit: sentence.minUnit ?? null,
            }))
          : [],
        vocab: [],
        tokenMap: new Map(),
      });
    }
  });

  return units;
}

async function loadWordEntries() {
  if (!cachedWordEntriesPromise) {
    cachedWordEntriesPromise = fetchWordEntries();
  }
  return cachedWordEntriesPromise;
}

async function fetchWordEntries() {
  if (typeof fetch !== 'function') {
    throw new Error('Fetching word bank entries requires a browser environment.');
  }

  const response = await fetch(WORDS_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error('Failed to load word bank entries.');
  }

  const text = await response.text();
  return parseWordBankWords(text);
}

function parseWordBankWords(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return {};
  }

  const lines = text.split(/\r?\n/);
  const units = {};
  let currentUnit = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    if (!line.startsWith(' ')) {
      currentUnit = null;
      return;
    }

    if (!trimmed.startsWith('-') && trimmed.endsWith(':')) {
      const unitId = stripQuotes(trimmed.slice(0, -1));
      currentUnit = unitId;
      if (!units[currentUnit]) {
        units[currentUnit] = [];
      }
      return;
    }

    if (trimmed.startsWith('-') && currentUnit) {
      const entry = parseWordEntry(trimmed);
      if (entry) {
        units[currentUnit].push(entry);
      }
    }
  });

  return units;
}

function parseWordEntry(line) {
  const match = line.match(/^-\s*\{(.+)\}\s*$/);
  if (!match) {
    return null;
  }

  const content = match[1];
  const parts = content.split(',').map((part) => part.trim());
  const entry = {};

  parts.forEach((part) => {
    const [rawKey, ...rest] = part.split(':');
    if (!rawKey || rest.length === 0) {
      return;
    }
    const key = rawKey.trim();
    const value = rest.join(':').trim();
    entry[key] = stripQuotes(value.replace(/^\{\s*|\s*\}$/g, ''));
  });

  if (!entry.si && !entry.en) {
    return null;
  }

  return {
    si: entry.si || '',
    translit: entry.translit || entry.transliteration || '',
    en: entry.en || '',
  };
}

function buildTokenMap(entries) {
  const map = new Map();
  if (!Array.isArray(entries)) {
    return map;
  }

  entries.forEach((entry) => {
    const keys = deriveCandidateKeys(entry);
    keys.forEach((key) => {
      if (key && !map.has(key)) {
        map.set(key, entry);
      }
    });
  });

  return map;
}

function deriveCandidateKeys(entry) {
  const keys = new Set();
  if (!entry) {
    return Array.from(keys);
  }

  const translit = entry.translit || entry.transliteration || '';
  const english = entry.en || '';

  const registerKey = (value) => {
    if (!value) {
      return;
    }
    const key = String(value);
    if (!key) {
      return;
    }
    keys.add(key);
    if (key.includes('v')) {
      keys.add(key.replace(/v/g, 'w'));
    }
  };

  const translitKey = normaliseTokenKey(translit);
  if (translitKey) {
    registerKey(translitKey);
    registerKey(translitKey.replace(/yi\b/g, 'i'));
    registerKey(translitKey.replace(/ayi\b/g, 'ai'));
  }

  registerKey(normaliseTokenKey(english));
  registerKey(normaliseTokenKey(entry.si));

  return Array.from(keys).filter(Boolean);
}

function normaliseTokenKey(value) {
  if (value == null) {
    return '';
  }

  const stringValue = value
    .toString()
    .replace(/[æÆ]/g, 'ae')
    .replace(/[œŒ]/g, 'oe')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();

  return stringValue;
}

function normaliseUnitId(value) {
  if (value == null) {
    return '';
  }
  return value
    .toString()
    .trim()
    .toLowerCase();
}

export default {
  loadSectionSentences,
  flattenSentences,
  shuffleArray,
  randomItem,
  filterUnlockedSentences,
  determineUnitId,
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  getWordEntryFromUnit,
};
