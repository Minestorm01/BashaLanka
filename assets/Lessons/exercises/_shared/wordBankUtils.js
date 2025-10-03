import { getVocabEntry as getFallbackVocabEntry } from './vocabMap.js';

const COURSE_MAP_URL = new URL('../../course.map.json', import.meta.url);

let cachedUnitsPromise = null;
let cachedWordBankUnitsPromise = null;
let cachedWordEntriesPromise = null;
let cachedCourseSectionsPromise = null;
let cachedCourseSections = null;
let cachedWordEntries = null;

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

async function loadCourseSections() {
  if (cachedCourseSections) {
    return cachedCourseSections;
  }

  if (!cachedCourseSectionsPromise) {
    cachedCourseSectionsPromise = fetchCourseSections().finally(() => {
      cachedCourseSectionsPromise = null;
    });
  }

  cachedCourseSections = await cachedCourseSectionsPromise;
  return cachedCourseSections;
}

async function fetchCourseSections() {
  if (typeof fetch !== 'function') {
    throw new Error('Fetching course sections requires a browser environment.');
  }

  const response = await fetch(COURSE_MAP_URL, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error('Failed to load course map.');
  }

  const data = await response.json();
  const sections = Array.isArray(data?.sections) ? data.sections : [];
  const readySections = [];

  sections.forEach((section, sectionIndex) => {
    if (!isReadyStatus(section?.status)) {
      return;
    }

    const rawId = section?.id || `section-${sectionIndex + 1}`;
    const sectionId = typeof rawId === 'string' ? rawId.trim() : `section-${sectionIndex + 1}`;
    const sectionNumber = Number.isFinite(section?.number)
      ? section.number
      : parseSectionNumberFromString(sectionId) ?? sectionIndex + 1;
    const sectionTitle = typeof section?.title === 'string' ? section.title.trim() : '';

    const units = Array.isArray(section?.units) ? section.units : [];
    const readyUnits = [];

    units.forEach((unit, unitIndex) => {
      if (!isReadyStatus(unit?.status)) {
        return;
      }

      const rawUnitId = unit?.id || `unit-${unitIndex + 1}`;
      const unitId = typeof rawUnitId === 'string' ? rawUnitId.trim() : `unit-${unitIndex + 1}`;
      const unitNumber = Number.isFinite(unit?.number)
        ? unit.number
        : parseUnitNumberFromId(unitId) ?? unitIndex + 1;
      const unitTitle = typeof unit?.title === 'string' ? unit.title.trim() : '';
      const pathRef = typeof unit?.path_ref === 'string' ? unit.path_ref.trim() : '';

      readyUnits.push({
        id: unitId,
        number: unitNumber,
        title: unitTitle,
        pathRef,
      });
    });

    readySections.push({
      id: sectionId,
      number: sectionNumber,
      title: sectionTitle,
      units: readyUnits,
    });
  });

  return readySections;
}

function isReadyStatus(value) {
  if (value == null) {
    return true;
  }
  const normalised = String(value).trim().toLowerCase();
  if (!normalised) {
    return true;
  }
  return normalised === 'ready' || normalised === 'published';
}

async function fetchSectionSentenceData(section) {
  if (!section || !section.id) {
    return [];
  }

  const sectionPath = `sections/${section.id}`;
  const url = new URL(`../../${sectionPath}/sentences.yaml`, import.meta.url);

  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) {
      return [];
    }

    const text = await response.text();
    const units = parseSectionYaml(text, {
      sectionId: section.id,
      sectionNumber: section.number,
      sectionTitle: section.title,
    });

    const unitMetaList = Array.isArray(section.units) ? section.units : [];
    const metaBySlug = new Map();
    const metaByNumber = new Map();

    unitMetaList.forEach((meta, index) => {
      if (!meta) {
        return;
      }
      const slug = typeof meta.id === 'string' ? meta.id.trim() : '';
      const number = Number.isFinite(meta.number)
        ? meta.number
        : parseUnitNumberFromId(meta.id) ?? index + 1;
      if (slug) {
        metaBySlug.set(slug.toLowerCase(), meta);
      }
      if (Number.isFinite(number)) {
        metaByNumber.set(number, meta);
      }
    });

    units.forEach((unit, index) => {
      const numericId = Number(unit?.id);
      const slug = typeof unit?.slug === 'string' ? unit.slug : null;
      let meta = null;

      if (slug && metaBySlug.has(slug.toLowerCase())) {
        meta = metaBySlug.get(slug.toLowerCase());
      } else if (Number.isFinite(numericId) && metaByNumber.has(numericId)) {
        meta = metaByNumber.get(numericId);
      } else if (metaByNumber.has(index + 1)) {
        meta = metaByNumber.get(index + 1);
      }

      if (meta) {
        const metaNumber = Number.isFinite(meta.number)
          ? meta.number
          : parseUnitNumberFromId(meta.id);
        if (Number.isFinite(metaNumber)) {
          unit.number = metaNumber;
        }
        if (!unit.slug && typeof meta.id === 'string') {
          unit.slug = meta.id;
        }
        if (!unit.name && typeof meta.title === 'string') {
          unit.name = meta.title;
        }
      }

      if (section.id) {
        unit.sectionId = section.id;
      }
      if (section.title) {
        unit.sectionTitle = section.title;
      }
      if (section.number != null) {
        unit.sectionNumber = section.number;
      } else if (unit.sectionNumber == null) {
        unit.sectionNumber = parseSectionNumberFromString(section.id);
      }

      if (!unit.slug) {
        const derivedNumber = Number.isFinite(unit.number)
          ? unit.number
          : Number.isFinite(numericId)
            ? numericId
            : null;
        if (Number.isFinite(derivedNumber)) {
          unit.slug = `unit-${String(derivedNumber).padStart(2, '0')}`;
        }
      }
    });

    return units;
  } catch (error) {
    console.warn('Failed to load word bank sentences for section', section?.id, error);
    return [];
  }
}

function resolveUnitMetaFromSection(section, unitSlug) {
  const units = Array.isArray(section?.units) ? section.units : [];
  if (!units.length) {
    return {
      unitNumber: parseUnitNumberFromId(unitSlug),
      unitTitle: '',
    };
  }

  const lowerSlug = typeof unitSlug === 'string' ? unitSlug.trim().toLowerCase() : '';
  if (lowerSlug) {
    const direct = units.find((unit) => typeof unit?.id === 'string' && unit.id.trim().toLowerCase() === lowerSlug);
    if (direct) {
      return {
        unitNumber: Number.isFinite(direct.number)
          ? direct.number
          : parseUnitNumberFromId(direct.id),
        unitTitle: typeof direct.title === 'string' ? direct.title : '',
      };
    }
  }

  const numeric = parseUnitNumberFromId(unitSlug);
  if (Number.isFinite(numeric)) {
    const match = units.find((unit) => {
      if (!unit) {
        return false;
      }
      if (Number.isFinite(unit.number)) {
        return unit.number === numeric;
      }
      return parseUnitNumberFromId(unit.id) === numeric;
    });
    if (match) {
      return {
        unitNumber: Number.isFinite(match.number) ? match.number : numeric,
        unitTitle: typeof match.title === 'string' ? match.title : '',
      };
    }
  }

  return {
    unitNumber: numeric,
    unitTitle: '',
  };
}

function parseUnitNumberFromId(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/unit[-_ ]?0*(\d+)/i);
  if (match) {
    return Number(match[1]);
  }
  const compact = String(value).match(/u(\d+)/i);
  if (compact) {
    return Number(compact[1]);
  }
  return null;
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
    const fallback = getFallbackVocabEntry(token) || {};
    const fallbackLabel = token.toString().replace(/_/g, ' ');
    const si = fallback.si || fallbackLabel;
    const translit = fallback.translit || fallback.transliteration || fallbackLabel;
    const en = fallback.en || fallbackLabel;

    return { si, en, translit };
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
    sectionId: unit.sectionId ?? null,
    sectionKey: unit.sectionKey ?? null,
    sectionNumber: unit.sectionNumber ?? null,
    vocab: Array.isArray(unit.vocab) ? unit.vocab.slice() : [],
    sentences: Array.isArray(unit.sentences)
      ? unit.sentences.map((sentence) => ({ ...sentence }))
      : [],
  }));
}

async function fetchSectionUnits() {
  const sections = await loadCourseSections();
  const allUnits = [];

  for (const section of sections) {
    const units = await fetchSectionSentenceData(section);
    allUnits.push(...units);
  }

  return allUnits;
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

function parseSectionYaml(text, context = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    return [];
  }

  const units = [];
  const lines = text.split(/\r?\n/);
  let currentUnit = null;
  let currentSentence = null;
  let mode = null;
  const defaultSectionKey = context.sectionKey || null;
  const defaultSectionId = context.sectionId || (defaultSectionKey ? normaliseSectionId(defaultSectionKey) : null);
  const defaultSectionNumber = context.sectionNumber ?? parseSectionNumberFromString(defaultSectionId);
  const defaultSectionTitle = context.sectionTitle || null;

  let currentSectionKey = defaultSectionKey;
  let currentSectionId = defaultSectionId;
  let currentSectionNumber = defaultSectionNumber;
  let currentSectionTitle = defaultSectionTitle;

  lines.forEach((line) => {
    if (!line) {
      return;
    }

    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const indent = line.match(/^\s*/)?.[0]?.length ?? 0;

    if (
      indent === 0 &&
      !trimmed.startsWith('-') &&
      trimmed.endsWith(':') &&
      !/^title:/i.test(trimmed) &&
      !/^description:/i.test(trimmed)
    ) {
      const rawKey = trimmed.replace(/:$/, '').trim();
      currentSectionKey = rawKey || currentSectionKey || defaultSectionKey;
      const derivedId = normaliseSectionId(rawKey);
      currentSectionId = context.sectionId || derivedId;
      currentSectionNumber =
        context.sectionNumber ??
        parseSectionNumberFromString(rawKey) ??
        parseSectionNumberFromString(currentSectionId);
      mode = null;
      currentUnit = null;
      currentSentence = null;
      return;
    }

    if (trimmed.startsWith('- id:')) {
      const idValue = trimmed.replace(/^- id:\s*/, '').trim();
      const parsedId = Number(idValue) || idValue;
      const numericId = Number(parsedId);
      const derivedNumber = Number.isFinite(numericId)
        ? numericId
        : parseUnitNumberFromId(parsedId);
      currentUnit = {
        id: parsedId,
        slug: typeof parsedId === 'string' ? parsedId : null,
        name: '',
        number: Number.isFinite(derivedNumber) ? derivedNumber : null,
        vocab: [],
        sentences: [],
        sectionKey: currentSectionKey || defaultSectionKey,
        sectionId: context.sectionId || currentSectionId || defaultSectionId,
        sectionNumber: context.sectionNumber ?? currentSectionNumber ?? defaultSectionNumber,
        sectionTitle: currentSectionTitle || defaultSectionTitle || null,
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

function normaliseSectionId(value) {
  if (value == null) {
    return null;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }

  const sectionMatch = trimmed.match(/section[-_ ]?(\d+)/i);
  if (sectionMatch) {
    return `section-${sectionMatch[1].padStart(2, '0')}`;
  }

  const sectionPrefixMatch = trimmed.match(/Section(\d+)/i);
  if (sectionPrefixMatch) {
    return `section-${sectionPrefixMatch[1].padStart(2, '0')}`;
  }

  return trimmed
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
}

function parseSectionNumberFromString(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/section[-_ ]?(\d+)/i);
  if (match) {
    return Number(match[1]);
  }

  const prefixed = String(value).match(/Section(\d+)/i);
  if (prefixed) {
    return Number(prefixed[1]);
  }

  const compact = String(value).match(/s(?:ection)?[-_ ]?0*(\d+)/i);
  if (compact) {
    return Number(compact[1]);
  }

  return null;
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

  const sentencesBySlug = new Map();
  const sentencesByNumber = new Map();

  sentences.forEach((unit) => {
    if (!unit) {
      return;
    }
    const slug = typeof unit.slug === 'string' ? unit.slug.trim() : null;
    const number = Number.isFinite(unit.number) ? unit.number : Number(unit.id);
    if (slug) {
      sentencesBySlug.set(slug.toLowerCase(), unit);
    }
    if (Number.isFinite(number)) {
      sentencesByNumber.set(number, unit);
    }
  });

  const units = [];

  wordEntries.forEach((entry, slug) => {
    if (!slug) {
      return;
    }
    const normalizedSlug = typeof slug === 'string' ? slug.trim() : String(slug);
    const lowerSlug = normalizedSlug.toLowerCase();
    const targetNumber = Number.isFinite(entry.unitNumber)
      ? entry.unitNumber
      : parseUnitNumberFromId(normalizedSlug);
    const sentenceUnit =
      (lowerSlug && sentencesBySlug.get(lowerSlug)) ||
      (Number.isFinite(targetNumber) ? sentencesByNumber.get(targetNumber) : null);

    const vocab = Array.isArray(entry.vocab)
      ? entry.vocab.map((word) => ({ ...word }))
      : [];

    units.push({
      id: normalizedSlug,
      slug: normalizedSlug,
      number: targetNumber ?? sentenceUnit?.number ?? null,
      name:
        sentenceUnit?.name ||
        entry.unitTitle ||
        (Number.isFinite(targetNumber) ? `Unit ${targetNumber}` : normalizedSlug),
      sectionId: entry.sectionId || sentenceUnit?.sectionId || null,
      sectionKey: sentenceUnit?.sectionKey || null,
      sectionNumber: entry.sectionNumber ?? sentenceUnit?.sectionNumber ?? null,
      sentences: Array.isArray(sentenceUnit?.sentences)
        ? sentenceUnit.sentences.map((sentence) => ({
            text: sentence.text || '',
            tokens: Array.isArray(sentence.tokens) ? sentence.tokens.slice() : [],
            minUnit: sentence.minUnit ?? null,
          }))
        : [],
      vocab,
      tokenMap: buildTokenMap(vocab),
    });
  });

  sentences.forEach((sentenceUnit) => {
    if (!sentenceUnit) {
      return;
    }
    const baseSlug = typeof sentenceUnit.slug === 'string'
      ? sentenceUnit.slug
      : Number.isFinite(sentenceUnit.number)
        ? `unit-${String(sentenceUnit.number).padStart(2, '0')}`
        : String(sentenceUnit.id);
    const exists = units.some((unit) => unit.slug === baseSlug || unit.id === sentenceUnit.id);
    if (!exists) {
      units.push({
        id: baseSlug,
        slug: baseSlug,
        number:
          sentenceUnit.number ??
          parseUnitNumberFromId(baseSlug) ??
          (Number.isFinite(Number(sentenceUnit.id)) ? Number(sentenceUnit.id) : null),
        name: sentenceUnit.name || baseSlug,
        sectionId: sentenceUnit.sectionId ?? null,
        sectionKey: sentenceUnit.sectionKey ?? null,
        sectionNumber: sentenceUnit.sectionNumber ?? null,
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
  if (cachedWordEntries) {
    return cachedWordEntries;
  }
  if (!cachedWordEntriesPromise) {
    cachedWordEntriesPromise = fetchWordEntries().finally(() => {
      cachedWordEntriesPromise = null;
    });
  }
  cachedWordEntries = await cachedWordEntriesPromise;
  return cachedWordEntries;
}

async function fetchWordEntries() {
  if (typeof fetch !== 'function') {
    throw new Error('Fetching word bank entries requires a browser environment.');
  }

  const sections = await loadCourseSections();
  const entries = new Map();

  for (const section of sections) {
    const sectionPath = section?.id ? `sections/${section.id}` : null;
    if (!sectionPath) {
      continue;
    }
    const url = new URL(`../../${sectionPath}/words.yaml`, import.meta.url);

    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) {
        continue;
      }

      const text = await response.text();
      const parsed = parseWordBankWords(text);
      Object.entries(parsed).forEach(([unitSlug, vocab]) => {
        if (!unitSlug) {
          return;
        }
        const meta = resolveUnitMetaFromSection(section, unitSlug);
        const record = {
          vocab: Array.isArray(vocab) ? vocab.map((entry) => ({ ...entry })) : [],
          sectionId: section.id || null,
          sectionNumber: section.number ?? parseSectionNumberFromString(section.id) ?? null,
          sectionTitle: section.title || '',
          unitNumber: meta.unitNumber,
          unitTitle: meta.unitTitle,
        };
        entries.set(unitSlug, record);
      });
    } catch (error) {
      console.warn('Failed to load word bank words for section', section?.id, error);
    }
  }

  return entries;
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
  if (typeof line !== 'string') {
    return null;
  }

  const trimmed = line.trim();
  if (!trimmed.startsWith('-')) {
    return null;
  }

  const commentIndex = trimmed.indexOf('#');
  const comment = commentIndex >= 0 ? trimmed.slice(commentIndex + 1).trim() : '';
  const rawContent = commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed;
  const content = rawContent.replace(/^-+\s*/, '').trim();

  if (!content) {
    return null;
  }

  if (content.startsWith('{') && content.endsWith('}')) {
    const inner = content.slice(1, -1);
    const parts = inner.split(',').map((part) => part.trim());
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

  const fallback = getFallbackVocabEntry(content) || {};
  const fallbackSi = fallback.si || content.replace(/_/g, ' ');
  const fallbackTranslit = fallback.translit || fallback.transliteration || content.replace(/_/g, ' ');
  const fallbackEn = comment || fallback.en || fallbackTranslit || fallbackSi;

  return {
    si: fallbackSi,
    translit: fallbackTranslit,
    en: fallbackEn,
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
