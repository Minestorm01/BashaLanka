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
  resolveLessonAssetPath,
} from '../_shared/utils.js';

const LESSON_MANIFEST_URL = new URL('../../lesson.manifest.json', import.meta.url);

function resolveLessonBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.href) {
    try {
      return new URL('.', window.location.href);
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('Unable to resolve base URL from window.location.href', error);
      }
    }
  }
  return new URL('.', LESSON_MANIFEST_URL);
}

const manifestCache = { data: null, promise: null };

function padNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return '';
  return String(number).padStart(2, '0');
}

function normaliseKey(value) {
  return normaliseText(value).toLowerCase();
}

function parseInlineObject(text) {
  if (!text) return null;
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
  if (typeof markdown !== 'string') return [];
  const match = markdown.match(/^\s*vocab:\s*([\s\S]*?)(?:\n[A-Za-z0-9_-]+\s*:|\n{2,}(?=\S)|$)/m);
  if (!match) return [];
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
      if (buffer) segments.push(buffer);
      buffer = trimmed.replace(/^-\s+/, '');
    } else if (buffer) {
      buffer += ` ${trimmed}`;
    }
  });
  if (buffer) segments.push(buffer);
  return segments.map(parseInlineObject).filter((entry) => entry && (entry.si || entry.en));
}

function stripYamlValue(value) {
  if (value === null || value === undefined) return '';
  let trimmed = value.toString().trim();
  if (!trimmed) return '';
  if (trimmed.endsWith(',')) {
    trimmed = trimmed.slice(0, -1).trim();
  }
  const startsWithQuote = trimmed.startsWith('"') || trimmed.startsWith("'");
  const endsWithQuote = trimmed.endsWith('"') || trimmed.endsWith("'");
  if (startsWithQuote && endsWithQuote) {
    trimmed = trimmed.slice(1, -1);
  }
  return normaliseText(trimmed);
}

function parseWordBankEntryText(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  const inline = parseInlineObject(trimmed);
  if (inline) return inline;

  const entry = {};
  let currentKey = null;
  const lines = text.split(/\r?\n/);
  lines.forEach((line) => {
    const raw = line.trim();
    if (!raw) return;
    const keyMatch = raw.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      let value = keyMatch[2];
      currentKey = key;
      if (!value) {
        entry[key] = Array.isArray(entry[key]) ? entry[key] : [];
        return;
      }
      value = value.trim();
      if (!value) {
        entry[key] = Array.isArray(entry[key]) ? entry[key] : [];
        return;
      }
      entry[key] = Array.isArray(entry[key]) ? entry[key] : stripYamlValue(value);
      return;
    }

    if (currentKey) {
      if (raw.startsWith('-')) {
        const item = stripYamlValue(raw.replace(/^-+\s*/, ''));
        if (!item) return;
        if (!Array.isArray(entry[currentKey])) {
          entry[currentKey] = entry[currentKey] ? [entry[currentKey]] : [];
        }
        entry[currentKey].push(item);
      } else if (Array.isArray(entry[currentKey])) {
        const item = stripYamlValue(raw);
        if (item) entry[currentKey].push(item);
      } else {
        const existing = entry[currentKey];
        const addition = stripYamlValue(raw);
        entry[currentKey] = existing ? `${existing} ${addition}`.trim() : addition;
      }
    }
  });
  return Object.keys(entry).length ? entry : null;
}

function extractWordBankPrompts(markdown) {
  if (typeof markdown !== 'string') return [];
  const match = markdown.match(/^[ \t]*wordbank(?:_prompts)?\s*:\s*([\s\S]*?)(?:\n[ A-Za-z0-9_-]+\s*:|\n{2,}(?=\S)|$)/m);
  if (!match) return [];
  const block = match[1] || '';
  const lines = block.split(/\r?\n/);
  const entries = [];
  let baseIndent = null;
  let buffer = [];

  const flush = () => {
    if (!buffer.length) return;
    const text = buffer.join('\n');
    const parsed = parseWordBankEntryText(text);
    if (parsed) entries.push(parsed);
    buffer = [];
  };

  lines.forEach((line) => {
    if (!line.trim()) return;
    const indent = line.match(/^\s*/)[0].length;
    const trimmed = line.trim();
    if (trimmed.startsWith('-')) {
      if (baseIndent === null) {
        baseIndent = indent;
      }
      if (indent === baseIndent) {
        flush();
        buffer.push(trimmed.replace(/^-+\s*/, ''));
        return;
      }
    }
    buffer.push(line);
  });

  flush();
  return entries;
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

function normaliseLessonPath(lessonPath) {
  if (typeof lessonPath !== 'string') return '';
  const trimmed = lessonPath.trim();
  if (!trimmed) return '';
  if (/^https?:/i.test(trimmed) || trimmed.startsWith('//')) return trimmed;
  const withoutLeadingDot = trimmed.replace(/^\.\/+/, '');
  if (!withoutLeadingDot) return '';
  return withoutLeadingDot.replace(/^\/+/, '');
}

export async function loadLessonSource(lessonPath) {
  if (!lessonPath || typeof lessonPath !== 'string') {
    throw new Error('Lesson path is required to load lesson source.');
  }
  const normalisedPath = normaliseLessonPath(lessonPath);
  if (!normalisedPath) throw new Error(`Invalid lesson path provided: ${lessonPath}`);
  const baseUrl = resolveLessonBaseUrl();
  const lessonAssetPath = resolveLessonAssetPath(normalisedPath);
  const url = new URL(lessonAssetPath, baseUrl);
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Failed to load lesson markdown: ${lessonPath}`);
  const markdown = await response.text();
  const vocab = extractVocabEntries(markdown);
  const wordBankPrompts = extractWordBankPrompts(markdown);
  return { path: normalisedPath, markdown, vocab, wordBankPrompts };
}

function narrowCandidates(candidates, predicate) {
  if (!Array.isArray(candidates) || !candidates.length) return [];
  const filtered = candidates.filter(predicate);
  return filtered.length ? filtered : candidates;
}

function resolveManifestEntry(manifest, context = {}) {
  const lessons = Array.isArray(manifest?.lessons) ? manifest.lessons : [];
  if (!lessons.length) return null;
  const meta = context.meta || {};
  const detail = context.detail || {};
  const lessonIdCandidates = [detail.id, detail.lessonId, meta.lessonId]
    .map((v) => (v ? v.toString().toLowerCase() : ''))
    .filter(Boolean);
  let candidates = lessons.slice();
  if (lessonIdCandidates.length) {
    candidates = narrowCandidates(candidates, (entry) =>
      lessonIdCandidates.includes((entry.lessonId || '').toString().toLowerCase())
    );
  }
  const sectionNumber = meta.sectionNumber || parseSectionNumber(detail.sectionId);
  if (sectionNumber) {
    const sectionPrefix = `section-${padNumber(sectionNumber)}`;
    candidates = narrowCandidates(candidates, (entry) =>
      normaliseText(entry.sectionId).startsWith(sectionPrefix)
    );
  }
  const unitNumber =
    meta.unitNumber || parseUnitNumber(meta.unitId) || parseUnitNumber(detail.unitId);
  if (unitNumber) {
    const unitPrefix = `unit-${padNumber(unitNumber)}`;
    candidates = narrowCandidates(candidates, (entry) =>
      normaliseText(entry.unitId).startsWith(unitPrefix)
    );
  }
  const lessonTitleCandidates = [detail.title, meta.lessonTitle]
    .map((value) => normaliseKey(value))
    .filter(Boolean);
  if (lessonTitleCandidates.length) {
    candidates = narrowCandidates(candidates, (entry) =>
      lessonTitleCandidates.includes(normaliseKey(entry.lessonTitle))
    );
  }
  return candidates[0] || null;
}

export async function fetchLessonVocab() {
  if (typeof window === 'undefined') {
    throw new Error('TranslateToBase requires a browser environment.');
  }
  const global = window.BashaLanka || {};
  const context = global.currentLesson || null;
  const detail = context?.detail || null;
  if (!context) throw new Error('Lesson context unavailable for TranslateToBase exercise.');

  const detailVocab = Array.isArray(detail?.vocab) ? detail.vocab : null;
  if (detailVocab && detailVocab.length) {
    const entries = detailVocab
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const si = normaliseText(entry.si) || entry.si;
        const en = normaliseText(entry.en) || entry.en;
        const translit = normaliseText(entry.translit || entry.transliteration);
        if (!si || !en) return null;
        return { ...entry, si, en, translit, transliteration: translit || entry.transliteration };
      })
      .filter(Boolean);
    if (entries.length >= 4) {
      const uniqueEnglish = new Set(
        entries.map((entry) => normaliseText(entry.en).toLowerCase()).filter(Boolean)
      );
      if (uniqueEnglish.size >= 4) return entries;
    }
  }
  if (detail?.lessonPath) {
    const lesson = await loadLessonSource(detail.lessonPath);
    if (!lesson.vocab.length)
      throw new Error('Lesson markdown is missing vocab entries for TranslateToBase exercise.');
    return lesson.vocab;
  }
  const manifest = await loadLessonManifest();
  const manifestEntry = resolveManifestEntry(manifest, context);
  if (!manifestEntry?.path) {
    throw new Error('Unable to resolve lesson markdown path for TranslateToBase exercise.');
  }
  const lesson = await loadLessonSource(manifestEntry.path);
  if (detail && typeof detail === 'object') {
    detail.lessonPath = lesson.path;
  }
  if (!lesson.vocab.length)
    throw new Error('Lesson markdown is missing vocab entries for TranslateToBase exercise.');
  return lesson.vocab;
}

export async function fetchAllLessonVocabsUpTo(lessonNumber) {
  const total = Number.parseInt(lessonNumber, 10);
  if (!Number.isFinite(total) || total <= 0) {
    return [];
  }

  const all = [];
  for (let i = 1; i <= total; i += 1) {
    const path = `assets/Lessons/lesson-${String(i).padStart(2, '0')}.md`;
    try {
      const lesson = await loadLessonSource(path);
      if (Array.isArray(lesson.vocab) && lesson.vocab.length) {
        all.push(...lesson.vocab);
      }
    } catch (error) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn(`⚠️ Could not load lesson ${i}:`, error);
      }
    }
  }
  return all;
}

export function pickRandomVocab(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries.filter((entry) => entry && entry.si && entry.en)
    : [];
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

export function buildTranslateToBaseConfig(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries.filter((entry) => entry && entry.si && entry.en)
    : [];
  if (!items.length) throw new Error('TranslateToBase requires at least one vocab entry.');
  const selected = pickRandomVocab(items);
  if (!selected) throw new Error('Failed to select a vocab entry for TranslateToBase.');
  const englishMap = new Map();
  items.forEach((entry) => {
    const label = normaliseText(entry.en);
    if (!label) return;
    const existing = englishMap.get(label);
    if (!existing || entry === selected) englishMap.set(label, entry);
  });
  const uniqueEntries = Array.from(englishMap.values());
  const distractorPool = uniqueEntries.filter((entry) => entry !== selected);
  if (distractorPool.length < 3) {
    throw new Error('TranslateToBase requires at least four distinct vocab entries.');
  }
  const distractors = shuffle(distractorPool).slice(0, 3);
  const prompt = normaliseText(selected.si) || selected.si;
  const transliteration = normaliseText(selected.translit || selected.transliteration);
  const correctEnglish = normaliseText(selected.en);
  const choices = shuffle([selected, ...distractors]).map((entry) => {
    const label = normaliseText(entry.en) || entry.en;
    return { label, value: label, isCorrect: entry === selected };
  });
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
  if (configOverride && typeof configOverride === 'object') return configOverride;
  if (typeof configOverride === 'string' && configOverride.trim()) {
    return loadLegacyConfig({ config: configOverride, baseUrl: import.meta.url });
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

  const header = document.createElement('div');
  header.className = 'translate-to-base__header';
  surface.appendChild(header);

  const badge = document.createElement('span');
  badge.className = 'translate-to-base__badge';
  badge.textContent = formatBadge(config.badge || 'NEW WORD');
  header.appendChild(badge);

  const headerMain = document.createElement('div');
  headerMain.className = 'translate-to-base__header-main';
  header.appendChild(headerMain);

  const lessonContext = window.BashaLanka?.currentLesson || {};
  const lessonDetail = lessonContext.detail || {};
  const lessonMeta = lessonContext.meta || {};
  let mascotSrc = lessonDetail.mascot;
  if (!mascotSrc && lessonMeta.sectionNumber) {
    mascotSrc = `assets/sections/section-${lessonMeta.sectionNumber}/mascot.svg`;
  }
  if (!mascotSrc) {
    mascotSrc = 'assets/sections/section-1/mascot.svg';
  }
  const mascot = document.createElement('img');
  mascot.className = 'translate-to-base__mascot';
  mascot.src = mascotSrc;
  mascot.alt = 'Lesson mascot';
  headerMain.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'translate-to-base__bubble';
  headerMain.appendChild(bubble);

  const soundButton = document.createElement('button');
  soundButton.type = 'button';
  soundButton.className = 'translate-to-base__sound';
  soundButton.setAttribute('aria-label', `Play pronunciation for ${config.prompt}`);
  const soundIcon = document.createElement('img');
  soundIcon.className = 'translate-to-base__sound-icon';
  soundIcon.src = 'assets/general/Sound_out_1.svg';
  soundIcon.alt = '';
  soundIcon.setAttribute('aria-hidden', 'true');
  soundButton.appendChild(soundIcon);

  const promptRow = document.createElement('div');
  promptRow.className = 'translate-to-base__prompt-row';
  bubble.appendChild(promptRow);

  promptRow.appendChild(soundButton);

  const prompt = document.createElement('span');
  prompt.className = 'translate-to-base__prompt-si';
  prompt.textContent = config.prompt;
  promptRow.appendChild(prompt);

  if (config.transliteration) {
    const transliteration = document.createElement('span');
    transliteration.className = 'translate-to-base__prompt-translit';
    transliteration.textContent = config.transliteration;
    bubble.appendChild(transliteration);
  }

// 🔊 Custom audio playback from /assets/Sinhala_Audio
soundButton.addEventListener('click', async (event) => {
  event.preventDefault();

  // Normalise filename: strip punctuation, collapse spaces into underscores
  const rawFileName = config.prompt
    .trim()
    .replace(/[?!.:,]/g, '')   // strip punctuation
    .replace(/\s+/g, '_');     // turn all spaces into underscores

  // Encode safely for URLs
  const baseFileName = encodeURIComponent(rawFileName);

  const fastPath = `assets/Sinhala_Audio/${baseFileName}_fast.mp3`;
  const slowPath = `assets/Sinhala_Audio/${baseFileName}_slowed.mp3`;

  if (!soundButton.audioEl) {
    soundButton.audioEl = new Audio();
    soundButton.clickCount = 0;
  }
  const audioEl = soundButton.audioEl;

  // count clicks
  soundButton.clickCount = (soundButton.clickCount || 0) + 1;

  // every 4th click = slow
  const isSlow = soundButton.clickCount % 4 === 0;
  const src = isSlow ? slowPath : fastPath;

  // stop any current playback
  audioEl.pause();
  audioEl.currentTime = 0;

  // play file
  audioEl.src = src;
  audioEl.play().catch((err) => {
    console.error('Audio playback error:', err, 'for src:', src);
  });
});

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

  return { wrapper, choicesContainer, feedback };
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('TranslateToBase config must be an object.');
  }
  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) throw new Error('TranslateToBase config requires a prompt.');
  const badge = normaliseText(rawConfig.badge) || 'NEW WORD';
  const transliteration = normaliseText(rawConfig.transliteration);
  const instructions =
    normaliseText(rawConfig.instructions) || 'Select the matching English meaning.';
  const successMessage = normaliseText(rawConfig.successMessage) || 'Correct! Nice work.';
  const errorMessage = normaliseText(rawConfig.errorMessage) || 'Not quite, try again.';
  const initialMessage = normaliseText(rawConfig.initialMessage);
  const answersLookup = createAnswerLookup(rawConfig.answers);
  const rawChoices = Array.isArray(rawConfig.choices) ? rawConfig.choices : [];
  const choices = rawChoices
    .map((choice) => normaliseChoiceItem(choice, { fallbackLabelKeys: ['value'] }))
    .filter((choice) => choice && choice.label);
  if (!choices.length) throw new Error('TranslateToBase config requires at least one choice.');
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
    return { ...choice, label: choice.label, value, isCorrect };
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
  if (!target) throw new Error('TranslateToBase target element not found.');
  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  let rawConfig;
  if (configOverride) {
    rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  } else {
    const context = window.BashaLanka?.currentLesson || {};
    const detail = context.detail || {};
    if (Array.isArray(detail.vocab) && detail.vocab.length) {
      rawConfig = buildTranslateToBaseConfig(detail.vocab);
    } else if (detail.lessonPath) {
      const lesson = await loadLessonSource(detail.lessonPath);
      rawConfig = buildTranslateToBaseConfig(lesson.vocab);
    } else {
      rawConfig = await loadConfig({ baseUrl: import.meta.url });
    }
  }
  const config = prepareConfig(rawConfig);
  const { wrapper, choicesContainer, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);
  const answers = new Set(config.answers.map(normaliseAnswer));
  const state = { completed: false };
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
            if (btn !== button) btn.classList.add('translate-to-base__choice--disabled');
          });
          if (typeof onComplete === 'function') {
            onComplete({ value });
          }
        } else {
          button.classList.add('translate-to-base__choice--wrong');
          button.classList.add('translate-to-base__choice--incorrect');
          setStatusMessage(feedback, config.errorMessage, 'error');
        }
      },
    })
  );
  buttons.forEach((button) => choicesContainer.appendChild(button));
  setStatusMessage(feedback, config.initialMessage || '', 'neutral');
  return { buttons, config };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.TranslateToBase = initTranslateToBaseExercise;
}

export default initTranslateToBaseExercise;
