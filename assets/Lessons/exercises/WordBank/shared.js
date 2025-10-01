import {
  normaliseText,
  shuffle,
} from '../_shared/utils.js';
import {
  fetchAllLessonVocabsUpTo,
  loadLessonSource,
  resolveLessonPathFromContext,
} from '../TranslateToBase/index.js';

const LESSON_MANIFEST_URL = new URL('../../lesson.manifest.json', import.meta.url);

const SENTENCE_SOURCE_URLS = [
  new URL('../../sections/section-01-introductions/sentences.yaml', import.meta.url),
];

const manifestCache = { data: null, promise: null };
const lessonCache = new Map();
const sentenceCache = { data: null, promise: null };

const PLACEHOLDER_LIBRARY = {
  name: [
    { en: 'Asha', si: 'ආශා', translit: 'Āshā', token: null },
    { en: 'Ravi', si: 'රවි', translit: 'Ravi', token: null },
    { en: 'Maya', si: 'මායා', translit: 'Māyā', token: null },
    { en: 'Victor', si: 'වික්ටර්', translit: 'Viktar', token: null },
  ],
  country: [
    { en: 'Sri Lanka', si: 'ශ්‍රී ලංකාව', translit: 'Sri Lankāva', token: 'sri_lanka' },
    { en: 'Australia', si: 'ඕස්ට්‍රේලියාව', translit: 'Ōsṭrēliyāva', token: 'australia' },
    { en: 'India', si: 'ඉන්දියාව', translit: 'Indiyāva', token: 'india' },
  ],
  age: [
    { en: 'ten', si: 'දහයයි', translit: 'dahaya', token: 'dahaya' },
    { en: 'twenty', si: 'විසියි', translit: 'visi', token: 'visi' },
    { en: 'thirty', si: 'තිහයි', translit: 'tis', token: 'tis' },
  ],
};

function stripComments(line) {
  if (!line) return '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '\\' && i + 1 < line.length) {
      i += 1;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble) {
      return line.slice(0, i);
    }
  }
  return line;
}

function normaliseTokenKey(value) {
  if (value === null || value === undefined) return '';
  const stripped = value
    .toString()
    .replace(/[{}\[\]()]/g, ' ');
  const normalised = normaliseText(stripped)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!normalised) return '';
  return normalised.replace(/\s+/g, '_');
}

function normaliseSectionId(value) {
  return normaliseText(value).toLowerCase();
}

function parseLessonNumber(value) {
  if (value === null || value === undefined) return null;
  const numeric = Number.parseInt(value, 10);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const match = value.toString().match(/lesson[-_\s]?(\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseUnitNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  const match = value.toString().match(/unit[-_\s]?(\d+)/i);
  if (!match) return null;
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function resolveLessonNumber(context = {}) {
  const meta = context.meta || {};
  const detail = context.detail || {};
  return (
    parseLessonNumber(meta.lessonNumber) ||
    parseLessonNumber(detail.lessonNumber) ||
    parseLessonNumber(meta.lessonId) ||
    parseLessonNumber(detail.lessonId) ||
    parseLessonNumber(detail.lessonPath)
  );
}

function resolveUnitNumber(context = {}) {
  const meta = context.meta || {};
  const detail = context.detail || {};
  return (
    parseUnitNumber(meta.unitNumber) ||
    parseUnitNumber(meta.unitId) ||
    parseUnitNumber(detail.unitNumber) ||
    parseUnitNumber(detail.unitId)
  );
}

function resolveSectionId(context = {}) {
  const meta = context.meta || {};
  const detail = context.detail || {};
  return normaliseSectionId(meta.sectionId || detail.sectionId || '');
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

async function getLessonSource(path) {
  if (!path) return null;
  const normalised = path.replace(/^\.\/+/, '').replace(/^\/+/, '');
  if (lessonCache.has(normalised)) {
    return lessonCache.get(normalised);
  }
  const promise = loadLessonSource(normalised)
    .then((data) => data)
    .catch((error) => {
      lessonCache.delete(normalised);
      throw error;
    });
  lessonCache.set(normalised, promise);
  return promise;
}

function parseInlineList(text) {
  if (!text) return [];
  const cleaned = text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((item) => item.replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
  return cleaned.filter(Boolean);
}

function parseSentenceBlock(blockText, unit) {
  const entries = [];
  const segments = blockText.split(/\n\s*-\s*text:\s*/).slice(1);
  segments.forEach((segment) => {
    const newlineIndex = segment.indexOf('\n');
    const rawText = newlineIndex >= 0 ? segment.slice(0, newlineIndex) : segment;
    const text = rawText.trim().replace(/^"|"$/g, '');
    const tokensMatch = segment.match(/\n\s*tokens\s*:\s*\[([^\]]*)\]/);
    const minUnitMatch = segment.match(/\n\s*minUnit\s*:\s*(\d+)/);
    const tokens = tokensMatch ? parseInlineList(tokensMatch[1]) : [];
    const minUnit = minUnitMatch ? Number.parseInt(minUnitMatch[1], 10) : unit?.id || 1;
    entries.push({
      id: `${unit?.id || '0'}-${entries.length + 1}`,
      text,
      tokens,
      minUnit: Number.isFinite(minUnit) ? minUnit : unit?.id || 1,
      unitId: unit?.id || null,
    });
  });
  return entries;
}

function parseSentencesYaml(text) {
  const units = [];
  if (typeof text !== 'string' || !text.trim()) {
    return units;
  }

  const withoutComments = text
    .split(/\r?\n/)
    .map((line) => stripComments(line))
    .join('\n');

  const parts = withoutComments.split(/\n\s*-\s*id:\s*/);
  parts.shift();
  parts.forEach((segment) => {
    const newlineIndex = segment.indexOf('\n');
    if (newlineIndex < 0) return;
    const idValue = segment.slice(0, newlineIndex).trim();
    const id = Number.parseInt(idValue, 10);
    if (!Number.isFinite(id)) return;
    const block = segment.slice(newlineIndex + 1);
    const sentencesMatch = block.match(/\n\s*sentences\s*:\s*([\s\S]*)$/);
    if (!sentencesMatch) return;
    const sentences = parseSentenceBlock(sentencesMatch[1], { id });
    units.push({ id, sentences });
  });
  return units;
}

async function loadSentenceDefinitions() {
  if (sentenceCache.data) return sentenceCache.data;
  if (!sentenceCache.promise) {
    sentenceCache.promise = Promise.all(
      SENTENCE_SOURCE_URLS.map((url) =>
        fetch(url, { cache: 'no-cache' })
          .then((response) => {
            if (!response.ok) throw new Error(`Failed to load sentence source: ${url}`);
            return response.text();
          })
          .then((text) => parseSentencesYaml(text))
      )
    )
      .then((results) => {
        const sentences = [];
        results.forEach((units) => {
          units.forEach((unit) => {
            unit.sentences.forEach((sentence) => {
              sentences.push({ ...sentence, unitId: unit.id });
            });
          });
        });
        sentenceCache.data = sentences;
        return sentences;
      })
      .finally(() => {
        sentenceCache.promise = null;
      });
  }
  return sentenceCache.promise;
}

function romanise(value) {
  return normaliseText(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateAliasVariants(base) {
  const variants = new Set();
  if (!base) return variants;
  const tokens = base.split(' ').filter(Boolean);
  if (!tokens.length) {
    variants.add(base);
    return variants;
  }
  const joined = tokens.join('_');
  variants.add(joined);
  variants.add(tokens.join(''));
  tokens.forEach((token) => variants.add(token));
  for (let length = 2; length <= tokens.length; length += 1) {
    for (let start = 0; start <= tokens.length - length; start += 1) {
      const slice = tokens.slice(start, start + length);
      variants.add(slice.join('_'));
      variants.add(slice.join(''));
    }
  }
  const endings = ['yi', 'i', 'ya', 'wa', 'va', 'ven', 'en', 'n', 'a'];
  Array.from(variants).forEach((variant) => {
    endings.forEach((ending) => {
      if (variant.endsWith(ending) && variant.length > ending.length + 1) {
        variants.add(variant.slice(0, -ending.length));
      }
    });
  });
  const cleaned = new Set();
  variants.forEach((variant) => {
    const trimmed = variant.replace(/_+/g, '_').replace(/^_+|_+$/g, '');
    if (trimmed) cleaned.add(trimmed);
  });
  return cleaned;
}

function normaliseVocabEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const si = normaliseText(entry.si || entry.sinhala || '');
  const en = normaliseText(entry.en || entry.english || '');
  const translit = normaliseText(entry.translit || entry.transliteration || '');
  if (!si && !translit) return null;
  return { si, en, translit };
}

function buildVocabIndex(entries) {
  const index = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    const normalised = normaliseVocabEntry(entry);
    if (!normalised) return;
    const { si, en, translit } = normalised;
    const baseRecord = { si, en, translit };

    const aliases = new Set();
    [si, en, translit]
      .map(romanise)
      .filter(Boolean)
      .forEach((value) => {
        generateAliasVariants(value).forEach((variant) => aliases.add(variant));
      });

    if (translit) {
      translit
        .split(/\s+/)
        .map(romanise)
        .filter(Boolean)
        .forEach((token) => {
          generateAliasVariants(token).forEach((variant) => aliases.add(variant));
        });
    }

    if (en) {
      en
        .split(/\s+/)
        .map((token) => token.replace(/[^A-Za-z0-9]+/g, ''))
        .filter(Boolean)
        .map((token) => token.toLowerCase())
        .forEach((token) => {
          aliases.add(token);
        });
    }

    aliases.forEach((alias) => {
      if (!alias) return;
      if (!index.has(alias)) {
        index.set(alias, baseRecord);
      }
    });
  });
  return index;
}

function dedupeVocab(entries) {
  const map = new Map();
  (Array.isArray(entries) ? entries : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const normalised = normaliseVocabEntry(entry);
    if (!normalised) return;
    const key = `${normalised.si}|${normalised.translit}|${normalised.en}`;
    if (!map.has(key)) {
      map.set(key, entry);
    }
  });
  return Array.from(map.values());
}

async function collectHistoricalVocab(context, unitNumber, lessonNumber) {
  const vocab = [];
  if (lessonNumber) {
    try {
      const current = await fetchAllLessonVocabsUpTo(lessonNumber);
      if (Array.isArray(current)) {
        vocab.push(...current);
      }
    } catch (error) {
      console.warn('⚠️ Unable to fetch vocab for current lessons.', error);
    }
  }

  if (!unitNumber || unitNumber <= 1) {
    return dedupeVocab(vocab);
  }

  const manifest = await loadLessonManifest();
  const lessons = Array.isArray(manifest?.lessons) ? manifest.lessons : [];
  const sectionId = resolveSectionId(context);
  const lessonPaths = new Set();

  lessons.forEach((entry) => {
    const entryUnitNumber = parseUnitNumber(entry.unitId || entry.unitNumber);
    if (!entryUnitNumber || entryUnitNumber >= unitNumber) {
      return;
    }
    if (sectionId) {
      const entrySection = normaliseSectionId(entry.sectionId);
      if (entrySection && entrySection !== sectionId) {
        return;
      }
    }
    if (entry?.path) {
      const normalisedPath = entry.path.replace(/^\.\/+/, '').replace(/^\/+/, '');
      lessonPaths.add(normalisedPath);
    }
  });

  await Promise.all(
    Array.from(lessonPaths).map((path) =>
      getLessonSource(path)
        .then((lesson) => {
          if (lesson && Array.isArray(lesson.vocab)) {
            vocab.push(...lesson.vocab);
          }
        })
        .catch((error) => {
          console.warn(`⚠️ Unable to load lesson vocab for ${path}`, error);
        })
    )
  );

  return dedupeVocab(vocab);
}

function extractPlaceholders(text) {
  if (!text || typeof text !== 'string') return [];
  const placeholders = new Set();
  const pattern = /\{([A-Za-z0-9_]+)\}/g;
  let match = pattern.exec(text);
  while (match) {
    placeholders.add(match[1]);
    match = pattern.exec(text);
  }
  return Array.from(placeholders);
}

function choosePlaceholderValue(key, tokenIndex) {
  const options = Array.isArray(PLACEHOLDER_LIBRARY[key]) ? PLACEHOLDER_LIBRARY[key] : [];
  if (!options.length) {
    return null;
  }
  const candidates = options.filter((option) => {
    if (!option || !option.token) return true;
    return tokenIndex.has(option.token);
  });
  const pool = candidates.length ? candidates : options;
  return shuffle(pool)[0];
}

function applyPlaceholders(text, tokenIndex) {
  const placeholders = extractPlaceholders(text);
  if (!placeholders.length) {
    return { text, placeholders: [] };
  }
  let finalText = text;
  const applied = [];
  placeholders.forEach((key) => {
    const value = choosePlaceholderValue(key, tokenIndex);
    if (!value) return;
    finalText = finalText.replace(new RegExp(`\{${key}\}`, 'g'), value.en);
    applied.push({ key, ...value });
  });
  return { text: finalText, placeholders: applied };
}

function splitEnglishWords(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

function buildSinhalaPrompt(tokens, placeholders = []) {
  const parts = tokens.map((token) => token.si || token.translit || token.token);
  placeholders.forEach((placeholder) => {
    if (placeholder?.si) {
      parts.push(placeholder.si);
    }
  });
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export async function loadWordBankData() {
  if (typeof window === 'undefined') {
    throw new Error('WordBank exercises require a browser environment.');
  }

  const context = window.BashaLanka?.currentLesson || {};
  const lessonNumber = resolveLessonNumber(context) || 1;
  const unitNumber = resolveUnitNumber(context) || 1;

  let vocabEntries = await collectHistoricalVocab(context, unitNumber, lessonNumber);

  if (!vocabEntries.length) {
    // Attempt fallback by loading current lesson path directly.
    try {
      const lessonPath = await resolveLessonPathFromContext(context);
      const lesson = await loadLessonSource(lessonPath);
      if (lesson && Array.isArray(lesson.vocab)) {
        vocabEntries = lesson.vocab;
      }
    } catch (error) {
      console.warn('⚠️ WordBank could not resolve lesson vocab fallback.', error);
    }
  }

  if (!vocabEntries.length) {
    throw new Error('WordBank requires vocabulary entries from lesson markdown.');
  }

  const vocabIndex = buildVocabIndex(vocabEntries);
  const sentences = await loadSentenceDefinitions();

  const eligible = sentences
    .map((sentence) => {
      const tokens = Array.isArray(sentence.tokens) ? sentence.tokens : [];
      const tokenData = tokens.map((token) => {
        const key = normaliseTokenKey(token);
        const vocab = key ? vocabIndex.get(key) : null;
        if (!vocab) return null;
        return { token, key, ...vocab };
      });
      if (tokenData.some((item) => !item)) {
        return null;
      }
      return {
        ...sentence,
        tokens: tokenData,
      };
    })
    .filter((sentence) => sentence && sentence.minUnit <= unitNumber);

  return {
    context,
    lessonNumber,
    unitNumber,
    vocabEntries,
    vocabIndex,
    sentences: eligible,
  };
}

export function prepareSentenceInstance(sentence, vocabIndex) {
  if (!sentence) return null;
  const tokenIndex = vocabIndex || new Map();
  const applied = applyPlaceholders(sentence.text, tokenIndex);
  const englishWords = splitEnglishWords(applied.text);
  if (englishWords.length < 1) {
    return null;
  }
  if (englishWords.length < 3 && sentence.tokens.length > 1) {
    return null;
  }
  return {
    id: sentence.id,
    minUnit: sentence.minUnit,
    tokens: sentence.tokens,
    placeholders: applied.placeholders,
    englishText: applied.text,
    englishWords,
    sinhalaPrompt: buildSinhalaPrompt(sentence.tokens, applied.placeholders),
  };
}

export { normaliseTokenKey, resolveLessonNumber, resolveUnitNumber, splitEnglishWords };

