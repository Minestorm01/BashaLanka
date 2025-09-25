const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="translate-to-target"]';
const STYLESHEET_ID = 'translate-to-target-stylesheet';

function ensureStylesheet() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLESHEET_ID)) return;
  const link = document.createElement('link');
  link.id = STYLESHEET_ID;
  link.rel = 'stylesheet';
  link.href = new URL('./styles.css', import.meta.url);
  document.head.appendChild(link);
}

function normaliseAnswer(value) {
  return (value || '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function shuffleArray(array) {
  const items = array.slice();
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

function normaliseSinhalaKey(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function countIndentation(line) {
  let count = 0;
  while (count < line.length && line[count] === ' ') {
    count += 1;
  }
  return count;
}

function splitInlineValues(value) {
  const items = [];
  let current = '';
  let depthBraces = 0;
  let depthBrackets = 0;
  let inSingle = false;
  let inDouble = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    const prevChar = value[index - 1];

    if (char === "'" && !inDouble && prevChar !== '\\') {
      inSingle = !inSingle;
    } else if (char === '"' && !inSingle && prevChar !== '\\') {
      inDouble = !inDouble;
    }

    if (!inSingle && !inDouble) {
      if (char === '{') depthBraces += 1;
      if (char === '}') depthBraces -= 1;
      if (char === '[') depthBrackets += 1;
      if (char === ']') depthBrackets -= 1;

      if (char === ',' && depthBraces === 0 && depthBrackets === 0) {
        items.push(current.trim());
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim().length) {
    items.push(current.trim());
  }

  return items;
}

function stripQuotes(value) {
  if (!value) return value;
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1).replace(/\\(["'\\])/g, '$1');
  }
  return value;
}

function parseInlineArray(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return [];
  return splitInlineValues(inner).map((item) => parseYamlScalar(item.trim()));
}

function parseInlineObject(value) {
  const inner = value.slice(1, -1).trim();
  if (!inner) return {};
  const result = {};
  splitInlineValues(inner).forEach((pair) => {
    if (!pair) return;
    const separatorIndex = pair.indexOf(':');
    if (separatorIndex === -1) return;
    const key = pair.slice(0, separatorIndex).trim();
    const rawValue = pair.slice(separatorIndex + 1).trim();
    result[stripQuotes(key)] = parseYamlScalar(rawValue);
  });
  return result;
}

function parseYamlScalar(value) {
  if (value === null || value === undefined) return value;
  const trimmed = value.trim();

  if (!trimmed.length) return '';

  if (trimmed === 'null' || trimmed === '~') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  if (!Number.isNaN(Number(trimmed)) && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }

  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    return parseInlineArray(trimmed);
  }

  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return parseInlineObject(trimmed);
  }

  return stripQuotes(trimmed);
}

function parseMultilineString(lines, startIndex, indent) {
  const collected = [];
  let index = startIndex;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed.length) {
      collected.push('');
      index += 1;
      continue;
    }

    const lineIndent = countIndentation(line);
    if (lineIndent < indent) {
      break;
    }

    collected.push(line.slice(indent));
    index += 1;
  }

  return { value: collected.join('\n'), nextIndex: index };
}

function parseYamlNode(lines, startIndex, indent) {
  let index = startIndex;
  let mode = null;
  const arrayResult = [];
  const objectResult = {};

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed.length || trimmed.startsWith('#')) {
      index += 1;
      continue;
    }

    const lineIndent = countIndentation(line);
    if (lineIndent < indent) {
      break;
    }

    if (trimmed.startsWith('- ')) {
      if (mode === 'object') {
        break;
      }
      mode = 'array';
      const content = trimmed.slice(2).trim();
      if (/^[|>]/.test(content)) {
        const multiline = parseMultilineString(lines, index + 1, indent + 2);
        arrayResult.push(multiline.value);
        index = multiline.nextIndex;
        continue;
      }

      if (content.length) {
        arrayResult.push(parseYamlScalar(content));
        index += 1;
        continue;
      }

      const child = parseYamlNode(lines, index + 1, indent + 2);
      arrayResult.push(child.value);
      index = child.nextIndex;
      continue;
    }

    if (mode === 'array') {
      break;
    }
    mode = 'object';

    const separatorIndex = trimmed.indexOf(':');
    if (separatorIndex === -1) {
      index += 1;
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const remainder = trimmed.slice(separatorIndex + 1).trim();

    if (/^[|>]/.test(remainder)) {
      const multiline = parseMultilineString(lines, index + 1, indent + 2);
      objectResult[key] = multiline.value;
      index = multiline.nextIndex;
      continue;
    }

    if (remainder.length) {
      objectResult[key] = parseYamlScalar(remainder);
      index += 1;
      continue;
    }

    const child = parseYamlNode(lines, index + 1, indent + 2);
    objectResult[key] = child.value;
    index = child.nextIndex;
  }

  return { value: mode === 'array' ? arrayResult : objectResult, nextIndex: index };
}

function parseLessonFrontMatter(rawText) {
  const normalised = rawText.replace(/\r\n?/g, '\n');
  if (normalised.startsWith('---')) {
    const withoutStart = normalised.slice(3);
    const closingIndex = withoutStart.indexOf('\n---');
    const frontMatter = closingIndex === -1 ? withoutStart : withoutStart.slice(0, closingIndex);
    return frontMatter.replace(/^\s*\n/, '');
  }
  return normalised;
}

function parseLessonYaml(frontMatter) {
  const lines = frontMatter.split('\n');
  const { value } = parseYamlNode(lines, 0, 0);
  return value;
}

async function loadLessonFromPath(path) {
  const response = await fetch(path);
  if (!response || !response.ok) {
    throw new Error(`Failed to fetch lesson data from ${path}`);
  }

  const lessonText = await response.text();
  const frontMatter = parseLessonFrontMatter(lessonText);
  const parsed = parseLessonYaml(frontMatter);

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(`Lesson file ${path} did not contain a parsable YAML document.`);
  }

  return parsed;
}

function isLessonLike(value) {
  return Boolean(value && typeof value === 'object' && Array.isArray(value.vocab));
}

async function loadLessonSource(source) {
  if (!source && source !== 0) {
    return null;
  }

  if (typeof source === 'string') {
    return loadLessonFromPath(source);
  }

  if (isLessonLike(source)) {
    return source;
  }

  throw new Error('TranslateToTarget lesson source must be a lesson path string or lesson data object.');
}

async function loadLessonsFromSources(sources) {
  if (!sources) {
    return [];
  }

  const list = Array.isArray(sources) ? sources : [sources];
  const lessons = [];

  for (const source of list) {
    if (!source) continue;
    try {
      const lesson = await loadLessonSource(source);
      if (lesson) {
        lessons.push(lesson);
      }
    } catch (error) {
      console.warn('Unable to load previous lesson for TranslateToTarget exercise.', error);
    }
  }

  return lessons;
}

function derivePreviousLessonPathsFromSource(source) {
  if (typeof source !== 'string') {
    return [];
  }

  const match = source.match(/^(.*\/lesson-)(\d+)(\.[^./]+)$/);
  if (!match) {
    return [];
  }

  const [, prefix, numberRaw, suffix] = match;
  const currentNumber = Number.parseInt(numberRaw, 10);
  if (Number.isNaN(currentNumber) || currentNumber <= 1) {
    return [];
  }

  const width = numberRaw.length;
  const paths = [];
  for (let value = 1; value < currentNumber; value += 1) {
    const padded = String(value).padStart(width, '0');
    paths.push(`${prefix}${padded}${suffix}`);
  }

  return paths;
}

function gatherVocabEntries(lesson) {
  if (!lesson || !Array.isArray(lesson.vocab)) {
    return [];
  }

  return lesson.vocab
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const si = normaliseSinhalaKey(entry.si);
      const english = Array.isArray(entry.en) ? entry.en.join(' / ') : entry.en;
      if (!si || !english) {
        return null;
      }

      return {
        si,
        translit: entry.translit ? String(entry.translit).trim() : '',
        en: String(english).trim(),
        new: Boolean(entry.new),
      };
    })
    .filter(Boolean);
}

function selectVocabForExercise(vocabEntries, options = {}) {
  if (!vocabEntries.length) {
    throw new Error('TranslateToTarget lesson does not contain any vocabulary entries.');
  }

  if (vocabEntries.length < 2) {
    throw new Error('TranslateToTarget requires at least two vocabulary entries to build a multiple-choice exercise.');
  }

  const correct = vocabEntries[Math.floor(Math.random() * vocabEntries.length)];
  const remaining = vocabEntries.filter((entry) => entry !== correct);
  let distractorCount = Number.isFinite(Number(options.distractorCount))
    ? Number(options.distractorCount)
    : 3;
  if (!Number.isFinite(distractorCount)) {
    distractorCount = 3;
  }
  distractorCount = Math.max(1, Math.floor(distractorCount));
  const maxDistractors = Math.min(distractorCount, remaining.length);
  const distractors = shuffleArray(remaining).slice(0, maxDistractors);
  const optionsList = shuffleArray([correct, ...distractors]);

  return { correct, options: optionsList };
}

function createChoiceModels(selection) {
  return selection.options.map((entry) => ({
    label: entry.si,
    transliteration: entry.translit || '',
    isCorrect: entry === selection.correct,
    entry,
  }));
}

function collectCorrectAnswersFromChoices(choices) {
  const answers = new Set();
  choices.forEach((choice) => {
    if (choice.isCorrect) {
      answers.add(normaliseAnswer(choice.label));
    }
  });

  if (!answers.size) {
    throw new Error('TranslateToTarget exercise could not determine a correct answer.');
  }

  return answers;
}

function buildSeenVocabSet(previousLessons) {
  if (!previousLessons || !previousLessons.length) {
    return null;
  }

  const seen = new Set();
  previousLessons.forEach((lesson) => {
    gatherVocabEntries(lesson).forEach((entry) => {
      const key = normaliseSinhalaKey(entry.si);
      if (key) {
        seen.add(key);
      }
    });
  });

  return seen;
}

function determineIsNewWord(entry, seenSet) {
  if (!entry) {
    return false;
  }

  const flagged = Boolean(entry.new);
  if (!seenSet) {
    return flagged;
  }

  const hasAppeared = seenSet.has(normaliseSinhalaKey(entry.si));
  return flagged || !hasAppeared;
}

function createExerciseConfigFromEntry(entry, overrides = {}) {
  const baseInstructions = 'Tap the matching Sinhala word.';
  const baseError = 'Not quite, try again.';

  const english = entry.en;
  const transliteration = entry.translit;

  return {
    prompt: english,
    promptDetails: overrides.promptDetails || '',
    instructions: overrides.instructions || baseInstructions,
    successMessage:
      overrides.successMessage || `Correct! '${entry.si}${transliteration ? ` (${transliteration})` : ''}' means '${english}'.`,
    errorMessage: overrides.errorMessage || baseError,
    initialMessage: overrides.initialMessage || '',
    mascot: overrides.mascot,
    mascotAlt: overrides.mascotAlt,
  };
}

function normaliseInlineChoices(choices) {
  if (!Array.isArray(choices)) {
    return [];
  }

  return choices
    .map((choice) => {
      if (choice === null || choice === undefined) {
        return null;
      }

      if (typeof choice === 'string' || typeof choice === 'number') {
        return {
          label: String(choice),
          transliteration: '',
          isCorrect: false,
          successMessage: null,
          entry: null,
        };
      }

      if (typeof choice !== 'object') {
        return null;
      }

      const label = choice.label ?? choice.si ?? choice.value;
      if (label === undefined || String(label).trim().length === 0) {
        return null;
      }

      const transliteration = choice.transliteration ?? choice.translit ?? '';
      const successMessage = choice.successMessage ? String(choice.successMessage) : null;

      return {
        label: String(label),
        transliteration: transliteration ? String(transliteration) : '',
        isCorrect: Boolean(choice.isCorrect ?? choice.correct),
        successMessage,
        entry: null,
      };
    })
    .filter(Boolean);
}

function collectInlineCorrectAnswers(config, choices) {
  const answers = new Set();

  if (Array.isArray(config.correctAnswers)) {
    config.correctAnswers
      .map(normaliseAnswer)
      .filter(Boolean)
      .forEach((answer) => answers.add(answer));
  }

  choices.forEach((choice) => {
    if (choice.isCorrect) {
      answers.add(normaliseAnswer(choice.label));
    }
  });

  if (!answers.size) {
    throw new Error('TranslateToTarget config requires at least one correct answer.');
  }

  return answers;
}

function buildInlineExerciseData(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('TranslateToTarget inline config must be an object.');
  }

  const prompt = rawConfig.prompt ? String(rawConfig.prompt).trim() : '';
  if (!prompt.length) {
    throw new Error('TranslateToTarget inline config requires a prompt.');
  }

  const choices = normaliseInlineChoices(rawConfig.choices);
  if (!choices.length) {
    throw new Error('TranslateToTarget inline config requires at least one choice.');
  }

  const answers = collectInlineCorrectAnswers(rawConfig, choices);

  const config = {
    prompt,
    promptDetails: rawConfig.promptDetails ? String(rawConfig.promptDetails) : '',
    instructions: rawConfig.instructions || 'Tap the matching Sinhala word.',
    successMessage: rawConfig.successMessage ? String(rawConfig.successMessage) : rawConfig.successMessage,
    errorMessage: rawConfig.errorMessage ? String(rawConfig.errorMessage) : 'Not quite, try again.',
    initialMessage: rawConfig.initialMessage ? String(rawConfig.initialMessage) : '',
    mascot: rawConfig.mascot,
    mascotAlt: rawConfig.mascotAlt,
  };

  return {
    config,
    choices,
    answers,
    isNewWord: false,
  };
}

async function resolveConfigSource(configSource) {
  if (!configSource && configSource !== 0) {
    return null;
  }

  if (typeof configSource === 'function') {
    return resolveConfigSource(configSource());
  }

  const resolved = await Promise.resolve(configSource);

  if (resolved && typeof resolved === 'function') {
    return resolveConfigSource(resolved());
  }

  if (resolved && typeof resolved === 'object') {
    return resolved;
  }

  if (typeof resolved === 'string') {
    return resolved;
  }

  return null;
}

async function resolveLessonSpecification(configSource) {
  const resolved = await resolveConfigSource(configSource);

  if (
    resolved &&
    typeof resolved === 'object' &&
    'prompt' in resolved &&
    Array.isArray(resolved.choices)
  ) {
    return { readyConfig: resolved };
  }

  if (typeof resolved === 'string' || isLessonLike(resolved)) {
    return { lessonSource: resolved, previousSources: [], overrides: {} };
  }

  if (!resolved || typeof resolved !== 'object') {
    throw new Error('TranslateToTarget requires a lesson path string or configuration object.');
  }

  const lessonSource =
    resolved.lesson ||
    resolved.lessonData ||
    resolved.lessonPath ||
    resolved.path ||
    (isLessonLike(resolved) ? resolved : null);

  if (!lessonSource) {
    throw new Error('TranslateToTarget config must include a lessonPath or lesson data.');
  }

  const providedPrevious = resolved.previousLessons ?? resolved.previousLessonPaths ?? resolved.priorLessons ?? resolved.priorLessonPaths ?? [];
  const previousSources = Array.isArray(providedPrevious) ? providedPrevious.slice() : [providedPrevious];

  if (typeof lessonSource === 'string') {
    const derived = derivePreviousLessonPathsFromSource(lessonSource);
    derived.forEach((path) => {
      if (!previousSources.includes(path)) {
        previousSources.push(path);
      }
    });
  }

  const overrides = {};
  ['instructions', 'successMessage', 'errorMessage', 'initialMessage', 'mascot', 'mascotAlt', 'promptDetails'].forEach((key) => {
    if (key in resolved && resolved[key] !== undefined) {
      overrides[key] = resolved[key];
    }
  });

  const selectionOptions = {};
  if ('distractorCount' in resolved && resolved.distractorCount !== undefined) {
    const parsed = Number(resolved.distractorCount);
    if (!Number.isNaN(parsed)) {
      selectionOptions.distractorCount = parsed;
    }
  }

  return { lessonSource, previousSources, overrides, selectionOptions };
}

async function loadExerciseData(configOverride) {
  const spec = await resolveLessonSpecification(configOverride);

  if (spec.readyConfig) {
    return buildInlineExerciseData(spec.readyConfig);
  }

  const lesson = await loadLessonSource(spec.lessonSource);
  if (!lesson) {
    throw new Error('TranslateToTarget could not load lesson data.');
  }

  const previousLessons = await loadLessonsFromSources(spec.previousSources);
  const vocabEntries = gatherVocabEntries(lesson);
  const selection = selectVocabForExercise(vocabEntries, spec.selectionOptions);
  const choices = createChoiceModels(selection);
  const answers = collectCorrectAnswersFromChoices(choices);
  const seenSet = buildSeenVocabSet(previousLessons);
  const isNewWord = determineIsNewWord(selection.correct, seenSet);
  const config = createExerciseConfigFromEntry(selection.correct, spec.overrides);

  return {
    config,
    choices,
    answers,
    isNewWord,
  };
}

function resolveMascotSrc(config) {
  const fallback = new URL('../../assets/sections/section-1/mascot.svg', import.meta.url).toString();
  if (!config || !config.mascot) {
    return fallback;
  }

  try {
    return new URL(config.mascot, import.meta.url).toString();
  } catch (error) {
    console.warn('Unable to resolve custom mascot asset for TranslateToTarget exercise.', error);
    return fallback;
  }
}

function createFeedbackElement() {
  const feedback = document.createElement('p');
  feedback.className = 'translate-to-target__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  return feedback;
}

function createExerciseLayout(config, meta = {}) {
  const wrapper = document.createElement('section');
  wrapper.className = 'translate-to-target';

  const surface = document.createElement('div');
  surface.className = 'translate-to-target__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('div');
  header.className = 'translate-to-target__header';
  surface.appendChild(header);

  const mascot = document.createElement('img');
  mascot.className = 'translate-to-target__mascot';
  mascot.src = resolveMascotSrc(config);
  mascot.alt = config.mascotAlt || 'Mascot for this lesson';
  header.appendChild(mascot);

  const promptGroup = document.createElement('div');
  promptGroup.className = 'translate-to-target__prompt-group';
  header.appendChild(promptGroup);

  if (meta.isNewWord) {
    const badge = document.createElement('span');
    badge.className = 'translate-to-target__new-word';
    badge.textContent = 'NEW WORD';
    promptGroup.appendChild(badge);
  }

  const prompt = document.createElement('h2');
  prompt.className = 'translate-to-target__prompt';
  prompt.textContent = config.prompt || '';
  promptGroup.appendChild(prompt);

  if (config.promptDetails) {
    const promptDetails = document.createElement('p');
    promptDetails.className = 'translate-to-target__prompt-details';
    promptDetails.textContent = config.promptDetails;
    promptGroup.appendChild(promptDetails);
  }

  const choicesContainer = document.createElement('div');
  choicesContainer.className = 'translate-to-target__choices';
  surface.appendChild(choicesContainer);

  const feedback = createFeedbackElement();
  surface.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'translate-to-target__instructions';
  instructions.textContent = config.instructions || 'Tap the matching Sinhala word.';
  surface.appendChild(instructions);

  return {
    wrapper,
    choicesContainer,
    feedback,
  };
}

function setFeedback(feedbackElement, { success, message }) {
  feedbackElement.textContent = message || '';
  feedbackElement.classList.remove('translate-to-target__feedback--success', 'translate-to-target__feedback--error');
  if (success === true) {
    feedbackElement.classList.add('translate-to-target__feedback--success');
  } else if (success === false) {
    feedbackElement.classList.add('translate-to-target__feedback--error');
  }
}

function formatSuccessMessage(choice, config) {
  if (choice?.successMessage && String(choice.successMessage).trim().length) {
    return String(choice.successMessage).trim();
  }

  if (config?.successMessage && String(config.successMessage).trim().length) {
    return String(config.successMessage).trim();
  }

  const entry = choice?.entry;
  if (entry) {
    const translit = entry.translit ? ` (${entry.translit})` : '';
    return `Correct! '${entry.si}${translit}' means '${entry.en}'.`;
  }

  const transliteration = choice?.transliteration ? ` (${choice.transliteration})` : '';
  return `Correct! '${choice?.label || ''}${transliteration}' means '${config?.prompt || ''}'.`;
}

function handleSuccess(state, selectedButton, choice) {
  const { container, choiceButtons, onComplete, config } = state;
  state.completed = true;
  container.classList.add('translate-to-target--completed');

  choiceButtons.forEach((button) => {
    button.classList.remove('translate-to-target__choice--selected', 'translate-to-target__choice--incorrect');
    if (button === selectedButton) {
      button.classList.add('translate-to-target__choice--correct');
    } else {
      button.classList.add('translate-to-target__choice--disabled');
    }
    button.disabled = true;
  });

  setFeedback(state.feedback, {
    success: true,
    message: formatSuccessMessage(choice, config),
  });

  if (typeof onComplete === 'function') {
    onComplete();
  }
}

function handleAttempt(state, choice, button) {
  if (state.completed) {
    return;
  }

  const { answers, feedback, config } = state;
  const normalised = normaliseAnswer(choice.label);

  state.choiceButtons.forEach((btn) => {
    if (btn !== button) {
      btn.classList.remove('translate-to-target__choice--incorrect', 'translate-to-target__choice--selected');
    }
  });

  button.classList.add('translate-to-target__choice--selected');
  button.classList.remove('translate-to-target__choice--incorrect');

  if (answers.has(normalised)) {
    handleSuccess(state, button, choice);
    return;
  }

  button.classList.add('translate-to-target__choice--incorrect');
  setFeedback(feedback, {
    success: false,
    message: config.errorMessage || 'Not quite, try again.',
  });
}

function createChoiceButton(choice, state) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'translate-to-target__choice';
  button.dataset.choiceValue = choice.label;

  const labelEl = document.createElement('span');
  labelEl.className = 'translate-to-target__choice-label';
  labelEl.textContent = choice.label;
  button.appendChild(labelEl);

  if (choice.transliteration) {
    const translitEl = document.createElement('span');
    translitEl.className = 'translate-to-target__choice-transliteration';
    translitEl.textContent = choice.transliteration;
    button.appendChild(translitEl);
  }

  button.addEventListener('click', () => handleAttempt(state, choice, button));
  return button;
}

export async function initTranslateToTargetExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('TranslateToTarget exercises require a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride = null,
    onComplete = null,
  } = options;

  if (!target) {
    throw new Error('TranslateToTarget exercise target element not found.');
  }

  ensureStylesheet();
  const { config, choices, answers, isNewWord } = await loadExerciseData(configOverride);
  const { wrapper, choicesContainer, feedback } = createExerciseLayout(config, { isNewWord });
  target.innerHTML = '';
  target.appendChild(wrapper);

  const state = {
    container: wrapper,
    feedback,
    answers,
    onComplete,
    config,
    choiceButtons: [],
    completed: false,
  };

  const buttons = choices.map((choice) => {
    const button = createChoiceButton(choice, state);
    choicesContainer.appendChild(button);
    return button;
  });
  state.choiceButtons = buttons;

  setFeedback(feedback, { success: null, message: config.initialMessage || '' });

  return state;
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.TranslateToTarget = initTranslateToTargetExercise;

  document.addEventListener('DOMContentLoaded', () => {
    const autoRoot = document.querySelector(DEFAULT_CONTAINER_SELECTOR);
    if (!autoRoot || autoRoot.dataset.translateToTargetInitialised) {
      return;
    }

    let inlineConfig = null;

    if (autoRoot.translateToTargetConfig && typeof autoRoot.translateToTargetConfig === 'object') {
      inlineConfig = autoRoot.translateToTargetConfig;
    } else if (autoRoot.dataset.translateToTargetConfig) {
      try {
        inlineConfig = JSON.parse(autoRoot.dataset.translateToTargetConfig);
      } catch (error) {
        console.error('Failed to parse inline TranslateToTarget config from dataset.', error);
      }
    }

    if (!inlineConfig) {
      return;
    }

    autoRoot.dataset.translateToTargetInitialised = 'true';
    initTranslateToTargetExercise({ target: autoRoot, config: inlineConfig }).catch((error) => {
      console.error('Failed to initialise TranslateToTarget exercise', error);
    });
  });
}

export default initTranslateToTargetExercise;
