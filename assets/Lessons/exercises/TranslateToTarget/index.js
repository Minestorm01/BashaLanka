import {
  ensureStylesheet,
  normaliseAnswer,
  normaliseText,
  setStatusMessage,
  createChoiceButton,
  shuffle,
  formatBadge,
  resolveLessonAssetPath,
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="translate-to-target"]';
const STYLESHEET_ID = 'translate-to-target-styles';
const LESSON_MANIFEST_URL = new URL('../../lesson.manifest.json', import.meta.url);

function playSinhalaAudio(translit, speed = 'fast') {
  if (!translit) return;

  const safeWord = translit.trim().toLowerCase();
  const filePath = `assets/Sinhala_Audio/${safeWord}_${speed}.mp3`;

  const audio = new Audio(filePath);
  audio.play().catch((err) => {
    console.error('Failed to play audio:', err, filePath);
  });
}

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

  const withoutLeadingDot = trimmed.replace(/^\.\/+/, '');
  if (!withoutLeadingDot) {
    return '';
  }

  return withoutLeadingDot.replace(/^\/+/, '');
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

async function loadLessonSource(lessonPath) {
  if (!lessonPath || typeof lessonPath !== 'string') {
    throw new Error('Lesson path is required to load lesson source.');
  }

  const normalisedPath = normaliseLessonPath(lessonPath);
  if (!normalisedPath) {
    throw new Error(`Invalid lesson path provided: ${lessonPath}`);
  }

  const baseUrl = resolveLessonBaseUrl();
  const lessonAssetPath = resolveLessonAssetPath(normalisedPath);
  const url = new URL(lessonAssetPath, baseUrl);

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

function normaliseVocabEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const si = normaliseText(entry.si) || entry.si;
  const en = normaliseText(entry.en) || entry.en;

  if (!si || !en) {
    return null;
  }

  const transliteration = normaliseText(entry.translit || entry.transliteration);

  return {
    ...entry,
    si,
    en,
    translit: transliteration,
    transliteration: transliteration || entry.transliteration,
  };
}

function pickRandomEntry(entries) {
  if (!Array.isArray(entries) || !entries.length) {
    return null;
  }
  const index = Math.floor(Math.random() * entries.length);
  return entries[index] || null;
}

function shouldShowRomanizedPronunciation() {
  const fallback = true;

  if (typeof window === 'undefined') {
    return fallback;
  }

  const prefs = window.__APP__?.AppState?.prefs;
  if (prefs && typeof prefs.romanized === 'boolean') {
    return prefs.romanized;
  }

  try {
    const stored = window.localStorage.getItem('prefs');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed.romanized === 'boolean') {
        return parsed.romanized;
      }
    }
  } catch (error) {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('Unable to read stored pronunciation preference', error);
    }
  }

  return fallback;
}

export function buildTranslateToTargetConfig(vocabEntries) {
  const items = Array.isArray(vocabEntries) ? vocabEntries.map(normaliseVocabEntry).filter(Boolean) : [];

  if (!items.length) {
    throw new Error('TranslateToTarget requires at least one vocab entry.');
  }

  const sinhalaMap = new Map();
  items.forEach((entry) => {
    const label = normaliseText(entry.si);
    if (!label) return;

    const key = label.toLowerCase();
    if (!sinhalaMap.has(key) || entry.priority) {
      sinhalaMap.set(key, entry);
    }
  });

  const uniqueEntries = Array.from(sinhalaMap.values());
  if (uniqueEntries.length < 4) {
    throw new Error('TranslateToTarget requires at least four distinct vocab entries.');
  }

  const selected = pickRandomEntry(uniqueEntries);
  if (!selected) {
    throw new Error('Failed to select a vocab entry for TranslateToTarget.');
  }

  const distractorPool = uniqueEntries.filter((entry) => entry !== selected);
  const distractors = shuffle(distractorPool).slice(0, 3);

  const prompt = normaliseText(selected.en) || selected.en;
  const correctSinhala = normaliseText(selected.si) || selected.si;
  const transliteration = normaliseText(selected.translit || selected.transliteration);
  const baseSuccessMessage = `Correct! '${prompt}' = '${correctSinhala}'.`;

  const choices = shuffle([selected, ...distractors]).map((entry) => {
    const label = normaliseText(entry.si) || entry.si;
    const choiceTransliteration = normaliseText(entry.translit || entry.transliteration);
    return {
      label,
      value: label,
      isCorrect: entry === selected,
      transliteration: choiceTransliteration,
    };
  });

  return {
    badge: 'TRANSLATE',
    prompt,
    transliteration,
    instructions: 'Select the Sinhala translation that matches the English word.',
    successMessage: transliteration
      ? `${baseSuccessMessage} (${transliteration}).`
      : baseSuccessMessage,
    successMessagePlain: baseSuccessMessage,
    errorMessage: `Not quite. '${prompt}' = '${correctSinhala}'. Try again.`,
    choices,
    answers: [correctSinhala],
  };
}

function buildLayout(config, options = {}) {
  const showTransliteration = Boolean(options.showTransliteration);
  const wrapper = document.createElement('section');
  wrapper.className = 'translate-to-target';
  wrapper.dataset.showRomanized = showTransliteration ? 'true' : 'false';

  const surface = document.createElement('div');
  surface.className = 'translate-to-target__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'translate-to-target__header';
  surface.appendChild(header);

  const badge = document.createElement('span');
  badge.className = 'translate-to-target__badge';
  badge.textContent = formatBadge(config.badge || 'TRANSLATE');
  header.appendChild(badge);

  const promptGroup = document.createElement('div');
  promptGroup.style.display = 'flex';
  promptGroup.style.flexDirection = 'column';
  promptGroup.style.alignItems = 'center';
  promptGroup.style.gap = '0.35rem';

  const promptRow = document.createElement('div');
  promptRow.style.display = 'flex';
  promptRow.style.alignItems = 'center';
  promptRow.style.gap = '0.5rem';
  promptGroup.appendChild(promptRow);

  const prompt = document.createElement('h2');
  prompt.className = 'translate-to-target__prompt';
  prompt.textContent = config.prompt || '';
  promptRow.appendChild(prompt);

  const soundButton = document.createElement('button');
  soundButton.type = 'button';
  soundButton.className = 'translate-to-target__sound';
  soundButton.setAttribute('aria-label', `Play pronunciation for ${config.prompt}`);

  const soundIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  soundIcon.setAttribute('viewBox', '0 0 24 24');
  soundIcon.setAttribute('width', '24');
  soundIcon.setAttribute('height', '24');
  soundIcon.setAttribute('aria-hidden', 'true');

  const speakerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  speakerPath.setAttribute('fill', 'currentColor');
  speakerPath.setAttribute(
    'd',
    'M5 9v6h3.586L14 20.414V3.586L8.586 9H5zm12.5 3a3.5 3.5 0 0 0-1.75-3.03v6.06A3.5 3.5 0 0 0 17.5 12zm-1.75-6.89v1.91A5.5 5.5 0 0 1 19.5 12a5.5 5.5 0 0 1-3.75 4.98v1.91A7.5 7.5 0 0 0 21.5 12a7.5 7.5 0 0 0-5.75-6.89z'
  );
  soundIcon.appendChild(speakerPath);

  soundButton.appendChild(soundIcon);

  soundButton.addEventListener('click', () => {
    playSinhalaAudio(config.translit, 'fast');
  });

  promptRow.appendChild(soundButton);

  if (config.translit) {
    const transliteration = document.createElement('p');
    transliteration.className = 'translate-to-target__transliteration';
    transliteration.textContent = config.translit;
    transliteration.lang = 'si-Latn';
    promptGroup.appendChild(transliteration);
  }

  header.appendChild(promptGroup);

  const choicesContainer = document.createElement('div');
  choicesContainer.className = 'translate-to-target__choices';
  surface.appendChild(choicesContainer);

  const feedback = document.createElement('p');
  feedback.className = 'translate-to-target__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'translate-to-target__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  return {
    wrapper,
    choicesContainer,
    feedback,
  };
}

function applyChoiceContent(button, choice, showTransliteration) {
  if (!button || !choice) {
    return;
  }

  const label = document.createElement('span');
  label.className = 'translate-to-target__choice-script';
  label.textContent = choice.label;

  button.innerHTML = '';

  if (showTransliteration && choice.transliteration) {
    const transliteration = document.createElement('span');
    transliteration.className = 'translate-to-target__choice-romanized';
    transliteration.textContent = choice.transliteration;
    transliteration.lang = 'si-Latn';
    button.appendChild(transliteration);
  }

  button.appendChild(label);
}

async function fetchLessonVocab() {
  if (typeof window === 'undefined') {
    throw new Error('TranslateToTarget requires a browser environment.');
  }

  const context = window.BashaLanka?.currentLesson || {};
  const detail = context.detail || {};

  const detailVocab = Array.isArray(detail.vocab) ? detail.vocab.map(normaliseVocabEntry).filter(Boolean) : [];
  if (detailVocab.length >= 4) {
    const uniqueSinhala = new Set(detailVocab.map((entry) => normaliseText(entry.si).toLowerCase()).filter(Boolean));
    if (uniqueSinhala.size >= 4) {
      return detailVocab;
    }
  }

  if (detail.lessonPath) {
    const lesson = await loadLessonSource(detail.lessonPath);
    if (!Array.isArray(lesson.vocab) || !lesson.vocab.length) {
      throw new Error('Lesson markdown is missing vocab entries for TranslateToTarget exercise.');
    }
    return lesson.vocab.map(normaliseVocabEntry).filter(Boolean);
  }

  throw new Error('Lesson vocab unavailable for TranslateToTarget exercise.');
}

export async function initTranslateToTargetExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('TranslateToTarget requires a browser environment.');
  }

  const { target = document.querySelector(DEFAULT_CONTAINER_SELECTOR), onComplete } = options;

  if (!target) {
    throw new Error('TranslateToTarget target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  const vocab = await fetchLessonVocab();
  const config = buildTranslateToTargetConfig(vocab);
  const showRomanized = shouldShowRomanizedPronunciation();
  const { wrapper, choicesContainer, feedback } = buildLayout(config, {
    showTransliteration: showRomanized,
  });

  target.innerHTML = '';
  target.appendChild(wrapper);

  const answers = new Set(config.answers.map(normaliseAnswer));
  const state = { completed: false };

  const buttons = config.choices.map((choice) =>
    createChoiceButton({
      label: choice.label,
      value: choice.value ?? choice.label,
      className: 'translate-to-target__choice',
      onClick: (value, button) => {
        if (state.completed) return;
        const normalised = normaliseAnswer(value);
        if (answers.has(normalised)) {
          state.completed = true;
          const successMessage = showRomanized
            ? config.successMessage
            : config.successMessagePlain || config.successMessage;
          setStatusMessage(feedback, successMessage, 'success');
          button.classList.add('translate-to-target__choice--correct');
          buttons.forEach((btn) => {
            btn.disabled = true;
            if (btn !== button) {
              btn.classList.add('translate-to-target__choice--disabled');
            }
          });
          if (typeof onComplete === 'function') {
            onComplete({ value });
          }
        } else {
          button.classList.add('translate-to-target__choice--incorrect');
          setStatusMessage(feedback, config.errorMessage, 'error');
        }
      },
    })
  );

  buttons.forEach((button, index) => {
    const choice = config.choices[index];
    applyChoiceContent(button, choice, showRomanized);
    choicesContainer.appendChild(button);
  });
  setStatusMessage(feedback, '', 'neutral');

  return {
    buttons,
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.TranslateToTarget = initTranslateToTargetExercise;
}

export default initTranslateToTargetExercise;
