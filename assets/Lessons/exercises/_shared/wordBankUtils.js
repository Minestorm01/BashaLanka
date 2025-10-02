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

export default {
  loadSectionSentences,
  flattenSentences,
  shuffleArray,
  randomItem,
};
