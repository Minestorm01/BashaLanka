const WORDS_URL = new URL('../../sections/section-01-introductions/words.yaml', import.meta.url);
const SENTENCES_URL = new URL('../../sections/section-01-introductions/sentences.yaml', import.meta.url);

let cachedUnitsPromise = null;

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
  if (!cachedUnitsPromise) {
    cachedUnitsPromise = fetchWordBankUnits();
  }
  const units = await cachedUnitsPromise;
  return units.map(cloneUnit);
}

export function resolveActiveUnit(units, providedUnitId) {
  if (!Array.isArray(units) || units.length === 0) {
    return null;
  }

  const candidates = [];
  if (providedUnitId != null) {
    candidates.push(providedUnitId);
  }
  candidates.push(...extractContextUnitCandidates());

  for (const candidate of candidates) {
    const match = findUnitByCandidate(units, candidate);
    if (match) {
      return match;
    }
  }

  return units[0];
}

export function getUnitSentences(unit) {
  if (!unit || !Array.isArray(unit.sentences)) {
    return [];
  }

  // Placeholder for future lesson-level or per-sentence gating logic.
  return unit.sentences.map((sentence) => ({
    id: sentence.id,
    text: sentence.text,
    tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
    minUnit: sentence.minUnit ?? null,
    unitId: unit.id,
  }));
}

export function getWordEntryFromUnit(unit, token) {
  if (!unit || !token) {
    return null;
  }

  const map = unit.wordMap || {};
  const direct = map[token];
  if (direct) {
    return direct;
  }

  const baseKey = normaliseWordBankToken(token);
  if (baseKey && map[baseKey]) {
    return map[baseKey];
  }

  const withoutUnderscore = baseKey ? baseKey.replace(/_/g, '') : '';
  if (withoutUnderscore && map[withoutUnderscore]) {
    return map[withoutUnderscore];
  }

  if (baseKey && baseKey.includes('w')) {
    const swapped = baseKey.replace(/w/g, 'v');
    if (map[swapped]) {
      return map[swapped];
    }
  }

  if (baseKey && baseKey.includes('v')) {
    const swapped = baseKey.replace(/v/g, 'w');
    if (map[swapped]) {
      return map[swapped];
    }
  }

  return null;
}

export function normaliseWordBankToken(value) {
  return createTokenKey(value);
}

async function fetchWordBankUnits() {
  if (typeof fetch !== 'function') {
    throw new Error('Fetching word bank content requires a browser environment.');
  }

  const [wordsResponse, sentencesResponse] = await Promise.all([
    fetch(WORDS_URL, { cache: 'no-cache' }),
    fetch(SENTENCES_URL, { cache: 'no-cache' }),
  ]);

  if (!wordsResponse.ok) {
    throw new Error('Failed to load section vocabulary.');
  }
  if (!sentencesResponse.ok) {
    throw new Error('Failed to load section sentences.');
  }

  const [wordsText, sentencesText] = await Promise.all([
    wordsResponse.text(),
    sentencesResponse.text(),
  ]);

  const wordsUnits = parseWordsYaml(wordsText);
  const sentenceUnits = parseSentencesYaml(sentencesText);
  return mergeUnitContent(wordsUnits, sentenceUnits);
}

function parseWordsYaml(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const units = [];
  const lines = text.split(/\r?\n/);
  let currentUnit = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    if (!line.startsWith('  ') && trimmed.endsWith(':')) {
      currentUnit = null;
      return;
    }

    if (line.startsWith('  ') && !line.startsWith('    ') && trimmed.endsWith(':')) {
      const unitId = trimmed.slice(0, -1);
      if (!unitId) {
        currentUnit = null;
        return;
      }
      currentUnit = { id: unitId, words: [] };
      units.push(currentUnit);
      return;
    }

    if (!currentUnit || !line.startsWith('    -')) {
      return;
    }

    const entry = parseWordEntry(line);
    if (entry) {
      currentUnit.words.push(entry);
    }
  });

  return units;
}

function parseWordEntry(line) {
  const content = line.replace(/^\s*-\s*/, '');
  if (!content) {
    return null;
  }

  if (content.startsWith('{') && content.endsWith('}')) {
    return createWordEntry(parseInlineObject(content));
  }

  const { value, comment } = splitValueAndComment(content);
  const token = stripQuotes(value.trim());
  if (!token) {
    return null;
  }

  return createWordEntry({
    token,
    en: comment,
  });
}

function parseInlineObject(text) {
  const inner = text.replace(/^\{\s*|\s*\}$/g, '');
  const result = {};
  let buffer = '';
  let depth = 0;

  for (let i = 0; i < inner.length; i += 1) {
    const char = inner[i];
    if (char === '{' || char === '[') {
      depth += 1;
    } else if (char === '}' || char === ']') {
      depth = Math.max(0, depth - 1);
    }

    if (char === ',' && depth === 0) {
      processInlineSegment(buffer, result);
      buffer = '';
    } else {
      buffer += char;
    }
  }

  if (buffer.trim()) {
    processInlineSegment(buffer, result);
  }

  return result;
}

function processInlineSegment(segment, target) {
  if (!segment) {
    return;
  }
  const parts = segment.split(':');
  if (parts.length < 2) {
    return;
  }
  const key = parts.shift().trim();
  const value = parts.join(':').trim();
  if (!key) {
    return;
  }
  target[key] = stripQuotes(value);
}

function createWordEntry(data) {
  const word = {
    token: (data.token || data.id || '').trim(),
    si: (data.si || data.script || '').trim(),
    translit: (data.translit || data.transliteration || '').trim(),
    en: (data.en || data.english || data.comment || '').trim(),
  };

  const canonicalCandidate =
    word.token || word.translit || word.si || word.en || '';
  word.canonicalToken = canonicalCandidate;

  const keys = new Set();
  addTokenCandidate(keys, word.token);
  addTokenCandidate(keys, word.translit);
  addTokenCandidate(keys, word.si);
  addTokenCandidate(keys, word.en);
  addTokenCandidate(keys, data.alias);

  if (Array.isArray(data.aliases)) {
    data.aliases.forEach((alias) => addTokenCandidate(keys, alias));
  }

  if (!keys.size) {
    addTokenCandidate(keys, canonicalCandidate);
  }

  word.normalizedKeys = Array.from(keys);

  if (!word.token && word.normalizedKeys.length > 0) {
    word.token = word.normalizedKeys[0];
  }

  return word;
}

function splitValueAndComment(line) {
  const hashIndex = line.indexOf('#');
  if (hashIndex === -1) {
    return { value: line, comment: '' };
  }
  return {
    value: line.slice(0, hashIndex),
    comment: line.slice(hashIndex + 1).trim(),
  };
}

function parseSentencesYaml(text) {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const units = [];
  const lines = text.split(/\r?\n/);
  let inUnits = false;
  let currentUnit = null;
  let currentSentence = null;

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    if (!inUnits) {
      if (trimmed === 'units:' || trimmed === 'units: []') {
        inUnits = true;
      }
      return;
    }

    const indent = line.search(/\S/);

    if (indent === 4 && trimmed.startsWith('- id:')) {
      const idValue = trimmed.replace(/^- id:\s*/, '').trim();
      currentUnit = {
        id: parseSentenceUnitId(idValue),
        name: '',
        sentences: [],
      };
      units.push(currentUnit);
      currentSentence = null;
      return;
    }

    if (!currentUnit) {
      return;
    }

    if (indent === 6 && trimmed.startsWith('name:')) {
      currentUnit.name = stripQuotes(trimmed.replace(/^name:\s*/, ''));
      return;
    }

    if (indent === 6 && trimmed === 'sentences:') {
      currentSentence = null;
      return;
    }

    if (indent === 8 && trimmed.startsWith('- text:')) {
      const textValue = stripQuotes(trimmed.replace(/^- text:\s*/, ''));
      currentSentence = {
        id: null,
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

    if (indent === 10 && trimmed.startsWith('tokens:')) {
      const tokenText = trimmed.replace(/^tokens:\s*/, '');
      currentSentence.tokens = parseArrayLiteral(tokenText);
      return;
    }

    if (indent === 10 && trimmed.startsWith('minUnit:')) {
      const value = trimmed.replace(/^minUnit:\s*/, '').trim();
      const parsed = Number(value);
      currentSentence.minUnit = Number.isNaN(parsed) ? value : parsed;
      return;
    }

    if (indent === 10 && trimmed.startsWith('id:')) {
      const value = trimmed.replace(/^id:\s*/, '').trim();
      const parsed = Number(value);
      currentSentence.id = Number.isNaN(parsed) ? stripQuotes(value) : parsed;
    }
  });

  return units;
}

function parseSentenceUnitId(value) {
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  return stripQuotes(value);
}

function mergeUnitContent(wordUnits, sentenceUnits) {
  const merged = [];
  const sentenceByNumber = new Map();

  sentenceUnits.forEach((unit) => {
    const number = typeof unit.id === 'number' ? unit.id : extractUnitNumber(unit.id);
    if (number != null) {
      sentenceByNumber.set(number, unit);
    }
  });

  const usedNumbers = new Set();

  wordUnits.forEach((wordUnit) => {
    const slug = wordUnit.id;
    const number = extractUnitNumber(slug);
    const sentenceUnit = number != null ? sentenceByNumber.get(number) : null;
    if (number != null) {
      usedNumbers.add(number);
    }

    const sentences = sentenceUnit ? sentenceUnit.sentences : [];
    const name = sentenceUnit?.name || '';
    merged.push(createUnitRecord({
      id: slug,
      number,
      name,
      words: wordUnit.words,
      sentences,
    }));
  });

  sentenceUnits.forEach((sentenceUnit) => {
    const number = typeof sentenceUnit.id === 'number' ? sentenceUnit.id : extractUnitNumber(sentenceUnit.id);
    if (number != null && usedNumbers.has(number)) {
      return;
    }
    const slug = typeof sentenceUnit.id === 'string' && sentenceUnit.id.includes('unit-')
      ? sentenceUnit.id
      : `unit-${String(number ?? merged.length + 1).padStart(2, '0')}`;
    merged.push(createUnitRecord({
      id: slug,
      number,
      name: sentenceUnit.name || '',
      words: [],
      sentences: sentenceUnit.sentences,
    }));
  });

  merged.sort((a, b) => {
    const numberA = typeof a.number === 'number' ? a.number : Number.POSITIVE_INFINITY;
    const numberB = typeof b.number === 'number' ? b.number : Number.POSITIVE_INFINITY;
    if (numberA !== numberB) {
      return numberA - numberB;
    }
    return (a.id || '').localeCompare(b.id || '');
  });

  return merged;
}

function createUnitRecord({ id, number, name, words, sentences }) {
  const preparedWords = Array.isArray(words)
    ? words.map((word) => ({
        token: word.token || '',
        si: word.si || '',
        translit: word.translit || '',
        en: word.en || '',
        canonicalToken: word.canonicalToken || word.token || '',
        normalizedKeys: Array.isArray(word.normalizedKeys) ? word.normalizedKeys.slice() : [],
      }))
    : [];

  const wordMap = createWordMap(preparedWords);

  const preparedSentences = Array.isArray(sentences)
    ? sentences.map((sentence) => ({
        id: sentence.id ?? null,
        text: sentence.text || '',
        tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
        minUnit: sentence.minUnit ?? null,
      }))
    : [];

  return {
    id,
    number: typeof number === 'number' && !Number.isNaN(number) ? number : null,
    name: name || '',
    words: preparedWords,
    wordMap,
    sentences: preparedSentences,
  };
}

function createWordMap(words) {
  const map = Object.create(null);
  words.forEach((word) => {
    const candidates = Array.isArray(word.normalizedKeys) ? word.normalizedKeys : [];
    candidates.forEach((candidate) => {
      if (candidate && !map[candidate]) {
        map[candidate] = word;
      }
    });

    if (word.token) {
      const lower = word.token.toLowerCase();
      if (!map[lower]) {
        map[lower] = word;
      }
    }

    if (word.canonicalToken) {
      const key = normaliseWordBankToken(word.canonicalToken);
      if (key && !map[key]) {
        map[key] = word;
      }
    }
  });
  return map;
}

function findUnitByCandidate(units, candidate) {
  if (candidate == null) {
    return null;
  }

  const stringCandidate = String(candidate).trim();
  if (!stringCandidate) {
    return null;
  }

  const lower = stringCandidate.toLowerCase();
  const direct = units.find((unit) => unit.id && unit.id.toLowerCase() === lower);
  if (direct) {
    return direct;
  }

  const numeric = Number(stringCandidate);
  if (!Number.isNaN(numeric) && numeric > 0) {
    const match = units.find((unit) => unit.number === numeric);
    if (match) {
      return match;
    }
  }

  return null;
}

function extractContextUnitCandidates() {
  if (typeof window === 'undefined') {
    return [];
  }

  const context = window.BashaLanka?.currentLesson || {};
  const detail = context.detail || {};
  const meta = context.meta || {};
  const candidates = [];

  if (detail.unitId != null) {
    candidates.push(detail.unitId);
  }
  if (detail.unitSlug != null) {
    candidates.push(detail.unitSlug);
  }
  if (detail.unit != null) {
    candidates.push(detail.unit);
  }
  if (meta.unitId != null) {
    candidates.push(meta.unitId);
  }
  if (meta.unitSlug != null) {
    candidates.push(meta.unitSlug);
  }

  return candidates;
}

function extractUnitNumber(value) {
  if (value == null) {
    return null;
  }
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  const text = String(value).trim();
  if (!text) {
    return null;
  }
  const numeric = Number(text);
  if (!Number.isNaN(numeric)) {
    return numeric;
  }
  const match = text.match(/unit-(\d+)/i);
  if (match) {
    return Number(match[1]);
  }
  return null;
}

function cloneUnit(unit) {
  if (!unit) {
    return null;
  }
  const words = Array.isArray(unit.words)
    ? unit.words.map((word) => ({
        token: word.token,
        si: word.si,
        translit: word.translit,
        en: word.en,
        canonicalToken: word.canonicalToken,
        normalizedKeys: Array.isArray(word.normalizedKeys) ? word.normalizedKeys.slice() : [],
      }))
    : [];
  const sentences = Array.isArray(unit.sentences)
    ? unit.sentences.map((sentence) => ({
        id: sentence.id,
        text: sentence.text,
        tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
        minUnit: sentence.minUnit,
      }))
    : [];
  return {
    id: unit.id,
    number: unit.number,
    name: unit.name,
    words,
    wordMap: createWordMap(words),
    sentences,
  };
}

function addTokenCandidate(collection, value) {
  if (value == null) {
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item) => addTokenCandidate(collection, item));
    return;
  }

  const key = createTokenKey(value);
  if (!key) {
    return;
  }

  collection.add(key);

  if (key.includes('v')) {
    collection.add(key.replace(/v/g, 'w'));
  }
  if (key.includes('w')) {
    collection.add(key.replace(/w/g, 'v'));
  }
  if (key.includes('_')) {
    collection.add(key.replace(/_/g, ''));
  }
}

function createTokenKey(value) {
  if (value == null) {
    return '';
  }
  const text = String(value).trim();
  if (!text) {
    return '';
  }
  const normalized = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/["'’“”‘]/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\{[^}]*\}/g, '')
    .replace(/&/g, 'and');

  const replaced = normalized
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');

  return replaced.toLowerCase();
}

function parseArrayLiteral(value) {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return trimmed
      .replace(/^[\[]|[\]]$/g, '')
      .split(',')
      .map((item) => stripQuotes(item.trim()))
      .filter(Boolean);
  }
}

function stripQuotes(value) {
  if (value == null) {
    return '';
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return '';
  }
  const firstChar = trimmed[0];
  const lastChar = trimmed[trimmed.length - 1];
  if ((firstChar === '"' && lastChar === '"') || (firstChar === '\'' && lastChar === '\'')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export default {
  loadWordBankUnits,
  resolveActiveUnit,
  getUnitSentences,
  getWordEntryFromUnit,
  normaliseWordBankToken,
  shuffleArray,
  randomItem,
};
