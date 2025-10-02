import {
  normaliseText,
  resolveLessonAssetPath,
} from './utils.js';
import {
  fetchAllLessonVocabsUpTo,
  loadLessonSource,
  resolveLessonPathFromContext,
} from '../TranslateToBase/index.js';

const LESSON_MANIFEST_URL = new URL('../../lesson.manifest.json', import.meta.url);
const sentenceCache = new Map();
const manifestCache = { data: null, promise: null };

function stripDiacritics(value) {
  if (!value) return '';
  return value
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[ˌˈ]/g, '');
}

export function normaliseTokenKey(value) {
  if (value === null || value === undefined) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9අ-ෆ]+/g, '');
}

function normaliseLessonPath(lessonPath) {
  if (typeof lessonPath !== 'string') return '';
  const trimmed = lessonPath.trim();
  if (!trimmed) return '';
  if (/^https?:/i.test(trimmed) || trimmed.startsWith('//')) return trimmed;
  const withoutLeadingDot = trimmed.replace(/^\.\/+/, '');
  if (!withoutLeadingDot) return '';
  return withoutLeadingDot.replace(/^\/+/, '');
}

async function loadLessonManifest() {
  if (manifestCache.data) return manifestCache.data;
  if (!manifestCache.promise) {
    manifestCache.promise = fetch(LESSON_MANIFEST_URL, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) throw new Error('Failed to load lesson manifest.');
        return response.json();
      })
      .then((data) => {
        manifestCache.data = data;
        return data;
      })
      .finally(() => {
        manifestCache.promise = null;
      });
  }
  return manifestCache.promise;
}

async function fetchSentencesForSection(sectionPath) {
  const key = sectionPath.replace(/\/+$|^\.\/+/, '');
  if (sentenceCache.has(key)) return sentenceCache.get(key);
  if (typeof fetch === 'undefined') {
    throw new Error('Sentence loading requires a browser environment.');
  }
  const relativePath = `${key.replace(/\/+$/, '')}/sentences.yaml`;
  const resolved = resolveLessonAssetPath(relativePath);
  const promise = fetch(resolved, { cache: 'no-cache' })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Failed to load sentences for section: ${sectionPath}`);
      }
      return response.text();
    })
    .then((text) => {
      try {
        const parsed = JSON.parse(text);
        const sentences = Array.isArray(parsed?.sentences) ? parsed.sentences : [];
        return sentences;
      } catch (error) {
        console.error('Unable to parse sentences.yaml. Ensure it is valid JSON/YAML.', error);
        return [];
      }
    })
    .finally(() => {
      sentenceCache.delete(key);
    });

  sentenceCache.set(key, promise);
  const sentences = await promise;
  sentenceCache.set(key, sentences);
  return sentences;
}

function splitEntryParts(value) {
  if (!value) return [];
  return value
    .toString()
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !/[\[\]{}]/.test(part) && part !== '/' && part !== '|')
    .map((part) => part.replace(/^[–—-]+/, ''))
    .filter(Boolean);
}

function registerWord({ map, unique }, siValue, translitValue, englishValue, source) {
  const script = siValue ? siValue.trim() : '';
  const translit = translitValue ? translitValue.trim() : '';
  if (!script) return;
  if (/[\[\]{}]/.test(script)) return;

  const cleanedScript = script.replace(/^[–—-]+/, '');
  if (!cleanedScript) return;

  const cleanedTranslit = translit.replace(/^[–—-]+/, '');
  const english = englishValue ? normaliseText(englishValue) : '';
  const tokenParts = cleanedScript.split(/\s+/).filter(Boolean);
  if (!tokenParts.length) return;
  const tokenCount = tokenParts.length;
  const isMultiWord = tokenCount > 1;
  const hasPunctuation = /[“”"'.,!?؛،၊།·…]/.test(cleanedScript);
  const baseSi = cleanedScript.replace(/[“”"'.,!?؛،၊།·…]/g, '').trim() || cleanedScript;
  const uniqueKey = `${cleanedScript}|${cleanedTranslit}`.toLowerCase();
  if (!unique.has(uniqueKey)) {
    unique.set(uniqueKey, {
      si: cleanedScript,
      translit: cleanedTranslit,
      english,
      source,
      tokenCount,
      isMultiWord,
      hasPunctuation,
      baseSi,
    });
  }
  const word = unique.get(uniqueKey);
  if (!word.translit && cleanedTranslit) {
    word.translit = cleanedTranslit;
  }
  const forms = new Set();
  forms.add(cleanedScript);
  if (cleanedTranslit) forms.add(cleanedTranslit);
  const ascii = stripDiacritics(cleanedTranslit);
  if (ascii && ascii !== cleanedTranslit) forms.add(ascii);
  if (ascii) {
    const nasalised = ascii.replace(/mh/g, 'nh');
    if (nasalised && nasalised !== ascii) forms.add(nasalised);
    const velarised = ascii.replace(/mh/g, 'ngh');
    if (velarised && velarised !== ascii && velarised !== nasalised) forms.add(velarised);
  }
  const scriptNoPunct = cleanedScript.replace(/[“”"'.,!?؛،၊།·…]/g, '');
  if (scriptNoPunct && scriptNoPunct !== cleanedScript) forms.add(scriptNoPunct);
  const translitNoPunct = cleanedTranslit.replace(/[“”"'.,!?·…]/g, '');
  if (translitNoPunct && translitNoPunct !== cleanedTranslit) forms.add(translitNoPunct);
  forms.forEach((form) => {
    const key = normaliseTokenKey(form);
    if (key && !map.has(key)) {
      map.set(key, word);
    }
  });
}

function buildVocabWordIndex(vocabEntries) {
  const map = new Map();
  const unique = new Map();
  const entries = Array.isArray(vocabEntries) ? vocabEntries : [];
  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const si = entry.si || entry.sinhala || '';
    const translit = entry.translit || entry.transliteration || '';
    const english = entry.en || entry.english || '';
    registerWord({ map, unique }, si, translit, english, entry);
    const scriptParts = splitEntryParts(si);
    const translitParts = splitEntryParts(translit);
    scriptParts.forEach((scriptPart, index) => {
      const translitPart = translitParts[index] || translitParts[translitParts.length - 1] || '';
      registerWord({ map, unique }, scriptPart, translitPart, english, entry);
    });
  });
  const words = Array.from(unique.values());
  const singleWordEntries = words.filter((word) => !(word.tokenCount > 1));
  return { map, words: singleWordEntries };
}

function dedupeVocabEntries(vocabEntries) {
  const unique = new Map();
  const entries = Array.isArray(vocabEntries) ? vocabEntries : [];
  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const si = normaliseText(entry.si || entry.sinhala || '');
    const translit = normaliseText(entry.translit || entry.transliteration || '');
    const english = normaliseText(entry.en || entry.english || '');
    if (!si && !translit) return;
    const key = `${si.toLowerCase()}|${translit.toLowerCase()}|${english.toLowerCase()}`;
    if (!unique.has(key)) {
      unique.set(key, {
        ...entry,
        si: si || entry.si,
        translit: translit || entry.translit || entry.transliteration,
        en: english || entry.en,
        english: english || entry.english,
        transliteration: translit || entry.transliteration,
      });
    }
  });
  return Array.from(unique.values());
}

function joinWordSequence(words, key = 'si') {
  const text = words
    .map((word) => (word && word[key] ? word[key] : ''))
    .filter(Boolean)
    .join(' ')
    .trim();
  if (!text) return '';
  return text.replace(/\s+([,!?])/g, '$1');
}

function normaliseSentenceForComparison(value) {
  if (value === null || value === undefined) return '';
  return value
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9අ-ෆ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function collectAnswers(definition, fallback) {
  const pool = [];
  const add = (value) => {
    if (!value && value !== 0) return;
    const text = normaliseText(value);
    if (!text) return;
    pool.push(text);
  };
  ['answers', 'accept', 'alternatives', 'englishAnswers'].forEach((key) => {
    const raw = definition[key];
    if (Array.isArray(raw)) raw.forEach(add);
    else add(raw);
  });
  add(fallback);
  const unique = [];
  const seen = new Set();
  pool.forEach((value) => {
    const key = normaliseText(value).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(value);
  });
  return unique;
}

function collectSinhalaAnswers(definition, fallback) {
  const pool = [];
  const add = (value) => {
    if (!value && value !== 0) return;
    const text = normaliseText(value);
    if (!text) return;
    pool.push(text);
  };
  ['sinhalaAnswers', 'siAnswers'].forEach((key) => {
    const raw = definition[key];
    if (Array.isArray(raw)) raw.forEach(add);
    else add(raw);
  });
  add(fallback);
  const unique = [];
  const seen = new Set();
  pool.forEach((value) => {
    const key = normaliseText(value).toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(value);
  });
  return unique;
}

function countEnglishTokens(tokens) {
  return tokens.filter((token) => token.type === 'word').length;
}

function buildEnglishTokens(text) {
  if (!text) return [];
  const segments = text.toString().match(/[A-Za-zÀ-ÖØ-öø-ÿ'’]+|[.,!?]/g) || [];
  const tokens = [];
  let current = null;
  segments.forEach((segment) => {
    if (/^[.,!?]$/.test(segment)) {
      if (current) {
        current.trailing += segment;
      }
      return;
    }
    const base = segment;
    current = {
      type: 'word',
      text: base,
      trailing: '',
      lower: stripDiacritics(base).replace(/[^a-z0-9']+/gi, '').toLowerCase(),
      display: base,
    };
    tokens.push(current);
  });
  return tokens;
}

function buildEnglishWordPool(words) {
  const pool = new Map();
  words.forEach((word) => {
    const english = word.english || '';
    if (!english) return;
    const matches = english.match(/[A-Za-zÀ-ÖØ-öø-ÿ'’]+/g);
    if (!matches) return;
    matches.forEach((match) => {
      const lower = stripDiacritics(match)
        .replace(/[^a-z0-9']+/gi, '')
        .toLowerCase();
      if (!lower) return;
      if (!pool.has(lower)) {
        const display = match.replace(/^[a-z]/, (letter) => letter.toUpperCase());
        pool.set(lower, { text: display, lower });
      }
    });
  });
  return Array.from(pool.values());
}

function prepareSentence(definition, vocabIndex, meta) {
  if (!definition || typeof definition !== 'object') return null;
  const tokens = Array.isArray(definition.tokens)
    ? definition.tokens.map((token) => normaliseText(token)).filter(Boolean)
    : [];
  if (!tokens.length) return null;
  const minUnit = Number.parseInt(definition.minUnit, 10) || 1;
  if (meta.unitNumber < minUnit) return null;
  const mapped = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const key = normaliseTokenKey(token);
    if (!key) return null;
    const match = vocabIndex.map.get(key);
    if (!match) return null;
    mapped.push({
      token,
      si: match.si,
      translit: match.translit,
      english: match.english,
      key,
    });
  }
  const englishTokens = buildEnglishTokens(definition.text || '');
  const englishCount = countEnglishTokens(englishTokens);
  const allowShort =
    Boolean(definition.allowShortPrompt) || tokens.length <= 1 || englishCount >= 3;
  if (!allowShort) return null;
  const sinhalaJoined = joinWordSequence(mapped, 'si');
  const sinhalaAnswers = collectSinhalaAnswers(definition, sinhalaJoined);
  const englishAnswers = collectAnswers(definition, definition.text || '');
  return {
    id: definition.id || definition.text || tokens.join('-'),
    text: definition.text || '',
    tokens,
    words: mapped,
    englishTokens,
    sinhalaAnswers,
    englishAnswers,
    promptSinhala: normaliseText(definition.promptSinhala) || sinhalaJoined,
    successMessage:
      normaliseText(definition.successMessage) || 'Correct! Great job building the sentence.',
    errorMessage:
      normaliseText(definition.errorMessage) || 'Not quite, try again.',
    initialMessage:
      normaliseText(definition.initialMessage) || 'Tap tiles to build the sentence.',
    instructions:
      normaliseText(definition.instructions) || 'Tap the tiles to build the sentence.',
    successMessageEnglish: normaliseText(definition.successMessageEnglish),
    errorMessageEnglish: normaliseText(definition.errorMessageEnglish),
    initialMessageEnglish: normaliseText(definition.initialMessageEnglish),
    instructionsEnglish: normaliseText(definition.instructionsEnglish),
    minUnit,
    allowShortPrompt: allowShort,
    sinhalaAnswersNormalised: sinhalaAnswers.map(normaliseSentenceForComparison),
    englishAnswersNormalised: englishAnswers.map(normaliseSentenceForComparison),
    englishWordCount: englishCount,
  };
}

async function resolveLessonMeta() {
  const context = window.BashaLanka?.currentLesson || null;
  if (!context) {
    throw new Error('Lesson context unavailable.');
  }
  const lessonPath = await resolveLessonPathFromContext(context);
  const normalisedPath = normaliseLessonPath(lessonPath);
  if (!normalisedPath) {
    throw new Error('Unable to resolve lesson path for word bank exercises.');
  }
  const sectionMatch = normalisedPath.match(/(assets\/Lessons\/sections\/section-[^/]+)/i);
  const unitMatch = normalisedPath.match(/units\/(unit-[^/]+)/i);
  const lessonMatch = normalisedPath.match(/lesson-(\d+)/i);
  if (!sectionMatch || !unitMatch || !lessonMatch) {
    throw new Error(`Unexpected lesson path format: ${normalisedPath}`);
  }
  const unitNumberMatch = unitMatch[1].match(/unit-(\d+)/i);
  return {
    context,
    lessonPath: normalisedPath,
    sectionPath: sectionMatch[1],
    unitId: unitMatch[1],
    unitNumber: unitNumberMatch ? Number.parseInt(unitNumberMatch[1], 10) : 1,
    lessonNumber: Number.parseInt(lessonMatch[1], 10) || 1,
  };
}

async function gatherAvailableVocab(meta) {
  const manifest = await loadLessonManifest();
  const lessons = Array.isArray(manifest?.lessons) ? manifest.lessons : [];
  const normalisedTarget = normaliseLessonPath(meta.lessonPath);
  if (!normalisedTarget) {
    throw new Error('Unable to resolve lesson path for vocab gathering.');
  }
  const uptoIndex = lessons.findIndex((entry) => {
    const entryPath = normaliseLessonPath(entry.path);
    return entryPath === normalisedTarget;
  });
  if (uptoIndex === -1) {
    throw new Error('Current lesson not found in manifest.');
  }

  const relevantEntries = lessons.slice(0, uptoIndex + 1);
  const currentUnitEntries = relevantEntries.filter((entry) => entry.unitId === meta.unitId);
  const priorUnitEntries = relevantEntries.filter((entry) => entry.unitId !== meta.unitId);
  const vocab = [];
  const seenLessons = new Set();

  const addLessonVocab = async (lessonPath) => {
    const normalised = normaliseLessonPath(lessonPath);
    if (!normalised || seenLessons.has(normalised)) return;
    seenLessons.add(normalised);
    try {
      const lesson = await loadLessonSource(normalised);
      if (Array.isArray(lesson.vocab) && lesson.vocab.length) {
        vocab.push(...lesson.vocab);
      }
    } catch (error) {
      console.warn('⚠️ Failed to load vocab for lesson', lessonPath, error);
    }
  };

  for (const entry of currentUnitEntries) {
    await addLessonVocab(entry.path);
  }

  for (const entry of priorUnitEntries) {
    await addLessonVocab(entry.path);
  }

  if (meta.lessonNumber && meta.lessonNumber > 0) {
    try {
      const currentUnitVocab = await fetchAllLessonVocabsUpTo(meta.lessonNumber);
      if (Array.isArray(currentUnitVocab) && currentUnitVocab.length) {
        vocab.push(...currentUnitVocab);
      }
    } catch (error) {
      console.warn('⚠️ Failed to load current unit vocab history', error);
    }
  }

  return dedupeVocabEntries(vocab);
}

export async function loadWordBankLessonData() {
  const meta = await resolveLessonMeta();
  const vocabEntries = await gatherAvailableVocab(meta);
  const vocabIndex = buildVocabWordIndex(vocabEntries);
  const sentenceDefinitions = await fetchSentencesForSection(meta.sectionPath);
  const sentences = [];
  sentenceDefinitions.forEach((definition) => {
    const prepared = prepareSentence(definition, vocabIndex, meta);
    if (prepared) sentences.push(prepared);
  });
  if (!sentences.length) {
    throw new Error('No eligible word bank sentences for this lesson.');
  }
  return {
    meta,
    sentences,
    vocabWords: vocabIndex.words,
    englishWordPool: buildEnglishWordPool(vocabIndex.words),
  };
}

export { joinWordSequence, normaliseSentenceForComparison };
