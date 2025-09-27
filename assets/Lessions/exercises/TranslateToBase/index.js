import {
  ensureStylesheet,
  loadConfig as loadLegacyConfig,
  normaliseAnswer,
  normaliseText,
  createAnswerLookup,
  addAnswerToLookup,
  answerLookupHas,
  normaliseChoiceItem,
  setStatusMessage,
  createChoiceButton,
  formatBadge,
  shuffle,
} from '../_shared/utils.js';

const LESSON_MANIFEST_URL = new URL('../../lesson.manifest.json', import.meta.url);

const manifestCache = {
  data: null,
  promise: null,
};

function padNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return '';
  }
  return String(number).padStart(2, '0');
}

function normaliseKey(value) {
  return normaliseText(value).toLowerCase();
}

function parseInlineObject(text) {
  if (!text) {
    return null;
  }

  let content = text.trim();

  if (content.startsWith('{') && content.endsWith('}')) {
    content = content.slice(1, -1);
  }

  const normalised = content.replace(/\s*\n\s*/g, ' ');
  const entry = {};
  const pattern = /([A-Za-z0-9_-]+)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^,}]+))/g;
  let match = pattern.exec(normalised);
  while (match) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    entry[key] = normaliseText(value);
    match = pattern.exec(normalised);
  }

  return Object.keys(entry).length ? entry : null;
}

function extractVocabEntries(markdown) {
  if (typeof markdown !== 'string') {
    return [];
  }

  const match = markdown.match(/^\s*vocab:\s*([\s\S]*?)(?:\n[A-Za-z0-9_-]+\s*:|\n{2,}(?=\S)|$)/m);
  if (!match) {
    return [];
  }

  const block = match[1] || '';
  const lines = block.split(/\r?\n/);
  const segments = [];
  let buffer = '';

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      if (buffer) {
        segments.push(buffer);
        buffer = '';
      }
      return;
    }

    if (/^-\s+/.test(trimmed)) {
      if (buffer) {
        segments.push(buffer);
      }
      buffer = trimmed.replace(/^-\s+/, '');
    } else if (buffer) {
      buffer += ` ${trimmed}`;
    }
  });

  if (buffer) {
    segments.push(buffer);
  }

  return segments
    .map(parseInlineObject)
    .filter((entry) => entry && (entry.si || entry.en));
}

function parseUnitNumber(value) {
  const match = typeof value === 'string' ? value.match(/u(\d+)/i) : null;
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function parseSectionNumber(value) {
  const match = typeof value === 'string' ? value.match(/section-(\d+)/i) : null;
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

async function loadLessonManifest() {
  if (manifestCache.data) {
    return manifestCache.data;
  }

  if (!manifestCache.promise) {
    manifestCache.promise = fetch(LESSON_MANIFEST_URL, { cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load lesson manifest.');
        }
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

function normaliseLessonPath(lessonPath) {
  if (typeof lessonPath !== 'string') {
    return '';
  }

  const trimmed = lessonPath.trim();
  if (!trimmed) {
    return '';
  }

  if (/^https?:/i.test(trimmed) || trimmed.startsWith('//')) {
    return trimmed;
  }

  return trimmed.replace(/^\.\//, '/');
}

async function loadLessonSource(lessonPath) {
  if (!lessonPath || typeof lessonPath !== 'string') {
    throw new Error('Lesson path is required to load lesson source.');
  }

  const normalisedPath = normaliseLessonPath(lessonPath);
  if (!normalisedPath) {
    throw new Error(`Invalid lesson path provided: ${lessonPath}`);
  }

  const baseUrl =
    typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : LESSON_MANIFEST_URL;
  const url = new URL(normalisedPath, baseUrl);
  if (typeof console !== 'undefined' && console.group) {
    const printableBaseUrl =
      typeof baseUrl === 'string' ? baseUrl : baseUrl?.toString?.() ?? String(baseUrl);
    console.group('📘 loadLessonSource Debug');
    console.log('Original lessonPath:', lessonPath);
    console.log('Normalised:', normalisedPath);
    console.log('Base URL:', printableBaseUrl);
    console.log('Resolved URL:', url.toString());
    console.groupEnd();
  }
  const response = await fetch(url, { cache: 'no-cache' });

  if (!response.ok) {
    throw new Error(`Failed to load lesson markdown: ${lessonPath}`);
  }

  const markdown = await response.text();
  const vocab = extractVocabEntries(markdown);

  return {
    path: normalisedPath,
    markdown,
    vocab,
  };
}

function narrowCandidates(candidates, predicate) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return [];
  }
  const filtered = candidates.filter(predicate);
  return filtered.length ? filtered : candidates;
}

function resolveManifestEntry(manifest, context = {}) {
  const lessons = Array.isArray(manifest?.lessons) ? manifest.lessons : [];
  if (!lessons.length) {
    return null;
  }

  const meta = context.meta || {};
  const detail = context.detail || {};

  const lessonIdCandidates = [detail.id, detail.lessonId, meta.lessonId]
    .map((value) => (value ? value.toString().toLowerCase() : ''))
    .filter(Boolean);

  let candidates = lessons.slice();

  if (lessonIdCandidates.length) {
    candidates = narrowCandidates(candidates, (entry) =>
      lessonIdCandidates.includes((entry.lessonId || '').toString().toLowerCase()),
    );
  }

  const sectionNumber = meta.sectionNumber || parseSectionNumber(detail.sectionId);
  if (sectionNumber) {
    const sectionPrefix = `section-${padNumber(sectionNumber)}`;
    candidates = narrowCandidates(candidates, (entry) =>
      normaliseText(entry.sectionId).startsWith(sectionPrefix),
    );
  }

  const unitNumber = meta.unitNumber || parseUnitNumber(meta.unitId) || parseUnitNumber(detail.unitId);
  if (unitNumber) {
    const unitPrefix = `unit-${padNumber(unitNumber)}`;
    candidates = narrowCandidates(candidates, (entry) =>
      normaliseText(entry.unitId).startsWith(unitPrefix),
    );
  }

  const lessonTitleCandidates = [detail.title, meta.lessonTitle]
    .map((value) => normaliseKey(value))
    .filter(Boolean);

  if (lessonTitleCandidates.length) {
    candidates = narrowCandidates(candidates, (entry) =>
      lessonTitleCandidates.includes(normaliseKey(entry.lessonTitle)),
    );
  }

  return candidates[0] || null;
}

async function fetchLessonVocab() {
  if (typeof window === 'undefined') {
    throw new Error('TranslateToBase requires a browser environment.');
  }

  const global = window.BashaLanka || {};
  const context = global.currentLesson || null;
  const detail = context?.detail || null;

  if (typeof console !== 'undefined' && console.log) {
    console.log('TranslateToBase detail at fetch time:', detail);
  }

  if (!context) {
    throw new Error('Lesson context unavailable for TranslateToBase exercise.');
  }

  if (detail?.lessonPath) {
    const lesson = await loadLessonSource(detail.lessonPath);

    if (!lesson.vocab.length) {
      throw new Error('Lesson markdown is missing vocab entries for TranslateToBase exercise.');
    }

    return lesson.vocab;
  }

  const manifest = await loadLessonManifest();
  const manifestEntry = resolveManifestEntry(manifest, context);

  if (!manifestEntry || !manifestEntry.path) {
    throw new Error('Unable to resolve lesson markdown path for TranslateToBase exercise.');
  }

  const lesson = await loadLessonSource(manifestEntry.path);

  if (detail && typeof detail === 'object') {
    detail.lessonPath = lesson.path;
  }

  if (!lesson.vocab.length) {
    throw new Error('Lesson markdown is missing vocab entries for TranslateToBase exercise.');
  }

  return lesson.vocab;
}

export function pickRandomVocab(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries.filter((entry) => entry && entry.si && entry.en)
    : [];

  if (!items.length) {
    return null;
  }

  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

export function buildTranslateToBaseConfig(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries.filter((entry) => entry && entry.si && entry.en)
    : [];

  if (!items.length) {
    throw new Error('TranslateToBase requires at least one vocab entry.');
  }

  const selected = pickRandomVocab(items);
  if (!selected) {
    throw new Error('Failed to select a vocab entry for TranslateToBase.');
  }

  const prompt = normaliseText(selected.si) || selected.si;
  const transliteration = normaliseText(selected.translit || selected.transliteration);
  const correctEnglish = normaliseText(selected.en);

  const choiceMap = new Map();
  items.forEach((entry) => {
    const label = normaliseText(entry.en);
    if (!label) return;
    const key = label.toLowerCase();
    if (!choiceMap.has(key)) {
      choiceMap.set(key, {
        label,
        value: label,
        isCorrect: entry === selected,
      });
    } else if (entry === selected) {
      const existing = choiceMap.get(key);
      existing.isCorrect = true;
    }
  });

  const choices = shuffle(Array.from(choiceMap.values()));

  return {
    prompt,
    transliteration,
    instructions: 'Select the English meaning that matches the Sinhala word.',
    successMessage: transliteration
      ? `Correct! '${prompt}' (${transliteration}) means '${correctEnglish}'.`
      : `Correct! '${prompt}' means '${correctEnglish}'.`,
    errorMessage: `Not quite. '${prompt}' = '${correctEnglish}'. Try again.`,
    choices,
    answers: [correctEnglish],
  };
}

async function loadConfig(options = {}) {
  const configOverride = options?.config;

  if (configOverride && typeof configOverride === 'object') {
    return configOverride;
  }

  if (typeof configOverride === 'string' && configOverride.trim()) {
    return loadLegacyConfig({
      config: configOverride,
      baseUrl: import.meta.url,
    });
  }

  const vocab = await fetchLessonVocab();
  return buildTranslateToBaseConfig(vocab);
}

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="translate-to-base"]';
const STYLESHEET_ID = 'translate-to-base-styles';

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'translate-to-base';

  const surface = document.createElement('div');
  surface.className = 'translate-to-base__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'translate-to-base__header';
  surface.appendChild(header);

  const badge = document.createElement('span');
  badge.className = 'translate-to-base__badge';
  badge.textContent = formatBadge(config.badge || 'NEW WORD');
  header.appendChild(badge);


  const prompt = document.createElement('h2');
  prompt.className = 'translate-to-base__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  if (config.transliteration) {
    const transliteration = document.createElement('p');
    transliteration.className = 'translate-to-base__transliteration';
    transliteration.textContent = config.transliteration;
    header.appendChild(transliteration);
  }

  const choicesContainer = document.createElement('div');
  choicesContainer.className = 'translate-to-base__choices';
  surface.appendChild(choicesContainer);

  const feedback = document.createElement('p');
  feedback.className = 'translate-to-base__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'translate-to-base__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  return {
    wrapper,
    choicesContainer,
    feedback,
  };
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('TranslateToBase config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) {
    throw new Error('TranslateToBase config requires a prompt.');
  }

  const badge = normaliseText(rawConfig.badge) || 'NEW WORD';
  const transliteration = normaliseText(rawConfig.transliteration);
  const instructions = normaliseText(rawConfig.instructions) || 'Select the matching English meaning.';
  const successMessage = normaliseText(rawConfig.successMessage) || 'Correct! Nice work.';
  const errorMessage = normaliseText(rawConfig.errorMessage) || 'Not quite, try again.';
  const initialMessage = normaliseText(rawConfig.initialMessage);

  const answersLookup = createAnswerLookup(rawConfig.answers);

  const rawChoices = Array.isArray(rawConfig.choices) ? rawConfig.choices : [];
  const choices = rawChoices
    .map((choice) => normaliseChoiceItem(choice, { fallbackLabelKeys: ['value'] }))
    .filter((choice) => choice && choice.label);

  if (!choices.length) {
    throw new Error('TranslateToBase config requires at least one choice.');
  }

  choices.forEach((choice) => {
    if (choice.isCorrect) {
      addAnswerToLookup(answersLookup, choice.value || choice.label);
    }
  });

  if (!answersLookup.size) {
    throw new Error('TranslateToBase config requires at least one correct answer.');
  }

  const hydratedChoices = choices.map((choice) => {
    const value = choice.value || choice.label;
    const isCorrect =
      choice.isCorrect ||
      answerLookupHas(answersLookup, value) ||
      answerLookupHas(answersLookup, choice.label);
    return {
      ...choice,
      label: choice.label,
      value,
      isCorrect,
    };
  });

  return {
    ...rawConfig,
    badge,
    prompt,
    transliteration,
    instructions,
    successMessage,
    errorMessage,
    initialMessage,
    choices: hydratedChoices,
    answers: Array.from(answersLookup.values()),
  };
}

export async function initTranslateToBaseExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('TranslateToBase requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('TranslateToBase target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  let rawConfig;

  if (configOverride) {
    rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  } else if (window.BashaLanka?.currentLesson?.detail?.lessonPath) {
    const lesson = await loadLessonSource(window.BashaLanka.currentLesson.detail.lessonPath);
    rawConfig = buildTranslateToBaseConfig(lesson.vocab);
  } else {
    rawConfig = await loadConfig({ baseUrl: import.meta.url });
  }

  const config = prepareConfig(rawConfig);
  const { wrapper, choicesContainer, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const answers = new Set(config.answers.map(normaliseAnswer));

  const state = {
    completed: false,
  };

  const buttons = config.choices.map((choice) =>
    createChoiceButton({
      label: choice.label,
      value: choice.value ?? choice.label,
      className: 'translate-to-base__choice',
      onClick: (value, button) => {
        if (state.completed) return;
        const normalised = normaliseAnswer(value);
        if (answers.has(normalised)) {
          state.completed = true;
          setStatusMessage(feedback, config.successMessage, 'success');
          button.classList.add('translate-to-base__choice--correct');
          buttons.forEach((btn) => {
            btn.disabled = true;
            if (btn !== button) {
              btn.classList.add('translate-to-base__choice--disabled');
            }
          });
          if (typeof onComplete === 'function') {
            onComplete({ value });
          }
        } else {
          button.classList.add('translate-to-base__choice--incorrect');
          setStatusMessage(feedback, config.errorMessage, 'error');
        }
      },
    })
  );

  buttons.forEach((button) => choicesContainer.appendChild(button));
  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  return {
    buttons,
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.TranslateToBase = initTranslateToBaseExercise;
}

export default initTranslateToBaseExercise;
