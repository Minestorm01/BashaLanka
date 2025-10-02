const SECTION_SOURCES = {
  'section-01-introductions': {
    path: '../../sections/section-01-introductions/sentences.yaml',
  },
};

const sectionCache = new Map();

function stripInlineComment(line) {
  if (!line) return '';
  let inSingle = false;
  let inDouble = false;
  let result = '';
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      result += char;
      continue;
    }
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      result += char;
      continue;
    }
    if (char === '#' && !inSingle && !inDouble) {
      break;
    }
    result += char;
  }
  return result.replace(/\t/g, '  ');
}

function parseScalarValue(raw) {
  if (raw === null || raw === undefined) return '';
  let value = raw.trim();
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value !== '') {
    return numeric;
  }
  return value;
}

function parseArrayLiteral(raw) {
  if (raw === null || raw === undefined) return [];
  let value = raw.trim();
  if (!value) return [];
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return [parseScalarValue(value)];
  }
  value = value.slice(1, -1).trim();
  if (!value) return [];
  const items = [];
  let buffer = '';
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      buffer += char;
      continue;
    }
    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      buffer += char;
      continue;
    }
    if (char === ',' && !inSingle && !inDouble) {
      if (buffer.trim()) {
        items.push(parseScalarValue(buffer.trim()));
      }
      buffer = '';
      continue;
    }
    buffer += char;
  }
  if (buffer.trim()) {
    items.push(parseScalarValue(buffer.trim()));
  }
  return items.map((item) => (typeof item === 'string' ? item.trim() : item)).filter((item) => item !== '');
}

function parseSentencesYaml(text) {
  const lines = Array.isArray(text?.split) ? text.split(/\r?\n/) : [];
  const sections = new Map();
  let currentSection = null;
  let currentUnit = null;
  let currentSentence = null;
  let activeList = null;

  lines.forEach((rawLine) => {
    const withoutComment = stripInlineComment(rawLine || '');
    if (!withoutComment.trim()) {
      return;
    }
    const indentMatch = withoutComment.match(/^\s*/);
    const indent = indentMatch ? indentMatch[0].length : 0;
    const content = withoutComment.trim();

    if (indent === 0) {
      const match = content.match(/^([A-Za-z0-9_-]+):\s*$/);
      if (match) {
        const sectionId = match[1];
        currentSection = {
          id: sectionId,
          title: '',
          description: '',
          units: [],
        };
        sections.set(sectionId, currentSection);
        currentUnit = null;
        currentSentence = null;
        activeList = null;
      }
      return;
    }

    if (!currentSection) {
      return;
    }

    if (indent === 2) {
      if (content.startsWith('title:')) {
        currentSection.title = parseScalarValue(content.slice(6));
        return;
      }
      if (content.startsWith('description:')) {
        currentSection.description = parseScalarValue(content.slice(12));
        return;
      }
      if (content.startsWith('units:')) {
        activeList = 'units';
        return;
      }
    }

    if (activeList === 'units') {
      if (indent === 4 && content.startsWith('- ')) {
        const rest = content.slice(2).trim();
        currentUnit = {
          id: null,
          name: '',
          vocab: [],
          sentences: [],
        };
        currentSection.units.push(currentUnit);
        if (rest) {
          const idx = rest.indexOf(':');
          if (idx !== -1) {
            const key = rest.slice(0, idx).trim();
            const value = parseScalarValue(rest.slice(idx + 1));
            if (key === 'id') {
              currentUnit.id = Number(value) || value;
            } else if (key) {
              currentUnit[key] = value;
            }
          }
        }
        currentSentence = null;
        activeList = 'unit-body';
        return;
      }
    }

    if (!currentUnit) {
      return;
    }

    if (indent === 6) {
      if (content.startsWith('name:')) {
        currentUnit.name = parseScalarValue(content.slice(5));
        return;
      }
      if (content.startsWith('id:')) {
        currentUnit.id = parseScalarValue(content.slice(3));
        return;
      }
      if (content.startsWith('vocab:')) {
        activeList = 'vocab';
        currentSentence = null;
        return;
      }
      if (content.startsWith('sentences:')) {
        activeList = 'sentences';
        currentSentence = null;
        return;
      }
    }

    if (activeList === 'vocab' && indent === 8 && content.startsWith('- ')) {
      const token = parseScalarValue(content.slice(2));
      if (token) {
        currentUnit.vocab.push(token);
      }
      return;
    }

    if (activeList === 'sentences') {
      if (indent === 8 && content.startsWith('- ')) {
        const sentence = {
          text: '',
          tokens: [],
          minUnit: null,
        };
        const rest = content.slice(2).trim();
        if (rest) {
          const idx = rest.indexOf(':');
          if (idx !== -1) {
            const key = rest.slice(0, idx).trim();
            const value = rest.slice(idx + 1).trim();
            if (key === 'text') {
              sentence.text = parseScalarValue(value);
            } else if (key === 'tokens') {
              sentence.tokens = parseArrayLiteral(value);
            } else if (key === 'minUnit') {
              sentence.minUnit = Number(parseScalarValue(value)) || null;
            }
          }
        }
        currentUnit.sentences.push(sentence);
        currentSentence = sentence;
        return;
      }
      if (currentSentence && indent >= 10) {
        const idx = content.indexOf(':');
        if (idx !== -1) {
          const key = content.slice(0, idx).trim();
          const value = content.slice(idx + 1).trim();
          if (key === 'text') {
            currentSentence.text = parseScalarValue(value);
          } else if (key === 'tokens') {
            currentSentence.tokens = parseArrayLiteral(value);
          } else if (key === 'minUnit') {
            currentSentence.minUnit = Number(parseScalarValue(value)) || null;
          }
        }
      }
    }
  });

  return sections;
}

export async function loadSectionSentenceData(sectionId, options = {}) {
  const source = SECTION_SOURCES[sectionId];
  if (!source) {
    throw new Error(`Unknown sentence section: ${sectionId}`);
  }
  if (sectionCache.has(sectionId)) {
    return sectionCache.get(sectionId);
  }
  const { path } = source;
  const baseUrl = options.baseUrl || import.meta.url;
  const url = new URL(path, baseUrl);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load sentences for ${sectionId}`);
  }
  const text = await response.text();
  const sections = parseSentencesYaml(text);
  const data = sections.get('Section01') || sections.get(sectionId) || null;
  sectionCache.set(sectionId, data);
  return data;
}

export function flattenSectionSentences(sectionData, sectionId) {
  if (!sectionData) return [];
  const units = Array.isArray(sectionData.units) ? sectionData.units : [];
  const sentences = [];
  units.forEach((unit) => {
    const unitSentences = Array.isArray(unit.sentences) ? unit.sentences : [];
    unitSentences.forEach((sentence, index) => {
      if (!sentence) return;
      sentences.push({
        ...sentence,
        sectionId: sectionId || sectionData.id || 'Section01',
        unitId: unit?.id ?? null,
        unitName: unit?.name || '',
        unitIndex: index,
      });
    });
  });
  return sentences;
}

export function collectUnitVocab(sectionData) {
  if (!sectionData) return new Map();
  const units = Array.isArray(sectionData.units) ? sectionData.units : [];
  const map = new Map();
  units.forEach((unit) => {
    const id = unit?.id ?? null;
    if (id === null || id === undefined) return;
    const vocabList = Array.isArray(unit.vocab) ? unit.vocab.filter(Boolean) : [];
    map.set(Number(id) || id, vocabList);
  });
  return map;
}

export function clearSentenceCache() {
  sectionCache.clear();
}

