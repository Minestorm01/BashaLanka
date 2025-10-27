import {
  ensureStylesheet,
  loadConfig,
  normaliseAnswer,
  normaliseText,
  createAnswerLookup,
  addAnswerToLookup,
  answerLookupHas,
  normaliseChoiceItem,
  setStatusMessage,
  shuffle,
  resolveLessonAssetPath,
} from '../_shared/utils.js';
import { fetchLessonVocab } from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="picture-choice"]';
const STYLESHEET_ID = 'picture-choice-styles';

const MACRON_REPLACEMENTS = [
  ['ā', 'aa'],
  ['ē', 'ee'],
  ['ī', 'ii'],
  ['ō', 'oo'],
  ['ū', 'uu'],
];

const LESSON_IMAGE_OVERRIDES = {
  'lesson-01': {
    oya: 'oya',
    eya: 'eyaa',
  },
};

const PLACEHOLDER_IMAGE = resolveLessonAssetPath('./assets/PNG/vocabulary/placeholder.png');

function stripDiacritics(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function expandMacrons(value) {
  let next = value;
  for (const [character, replacement] of MACRON_REPLACEMENTS) {
    next = next.replace(new RegExp(character, 'g'), replacement);
  }
  return next;
}

function toFilenameSlug(value) {
  if (!value) return '';
  const stripped = stripDiacritics(value);
  return stripped.replace(/[^a-z0-9]+/g, '');
}

function resolveLessonOverrideSlug(lessonId, translit) {
  if (!lessonId) return null;
  const overrides = LESSON_IMAGE_OVERRIDES[lessonId];
  if (!overrides) return null;
  const key = toFilenameSlug(translit);
  return overrides[key] || null;
}

function buildLessonImageSources(lessonId, translit) {
  const normalised = normaliseText(translit).toLowerCase();
  if (!normalised) {
    return [];
  }

  const sources = new Set();
  const overrideSlug = resolveLessonOverrideSlug(lessonId, normalised);
  if (overrideSlug) {
    sources.add(overrideSlug);
  }

  const variants = [expandMacrons(normalised), normalised];
  for (const variant of variants) {
    const slug = toFilenameSlug(variant);
    if (slug) {
      sources.add(slug);
    }
  }

  if (!sources.size) {
    return [];
  }

  const basePath = `./assets/PNG/vocabulary/${lessonId}/`;
  return Array.from(sources, (slug) => `${basePath}${slug}.png`);
}

function extractLessonIdFromPath(path) {
  if (!path || typeof path !== 'string') {
    return null;
  }
  const match = path.match(/lesson-(\d+)/);
  return match ? `lesson-${match[1]}` : null;
}

function buildImageVariants(path) {
  if (!path || typeof path !== 'string') {
    return [];
  }

  const trimmed = normaliseText(path);
  if (!trimmed) {
    return [];
  }

  if (/^(data:|https?:|\/\/)/i.test(trimmed)) {
    return [trimmed];
  }

  const variants = new Set([trimmed]);

  const match = trimmed.match(/^(.*\/)?([^/]+)$/);
  if (!match) {
    return Array.from(variants);
  }

  const directory = match[1] || '';
  const filename = match[2];
  const extensionIndex = filename.lastIndexOf('.');
  const basename = extensionIndex >= 0 ? filename.slice(0, extensionIndex) : filename;
  const extension = extensionIndex >= 0 ? filename.slice(extensionIndex) : '';
  const lessonId = extractLessonIdFromPath(directory);

  if (lessonId) {
    const slugCandidates = buildLessonImageSources(lessonId, basename);
    for (const candidate of slugCandidates) {
      const resolved = candidate.startsWith('./') ? candidate : `${directory}${candidate}`;
      variants.add(resolved);
    }
  }

  const localBase = normaliseText(basename).toLowerCase();
  if (localBase) {
    const localCandidates = new Set([toFilenameSlug(expandMacrons(localBase)), toFilenameSlug(localBase)]);
    for (const candidate of localCandidates) {
      if (!candidate) continue;
      const resolved = `${directory}${candidate}${extension}`;
      variants.add(resolved);
    }
  }

  return Array.from(variants);
}

function resolveImageSources(image, fallbackList = []) {
  const queue = [];

  const pushCandidate = (candidate) => {
    if (!candidate || typeof candidate !== 'string') return;
    const trimmed = candidate.trim();
    if (!trimmed) return;
    const resolved = resolveLessonAssetPath(trimmed);
    if (!resolved) return;
    if (!queue.includes(resolved)) {
      queue.push(resolved);
    }
  };

  const initialSources = [];
  if (typeof image === 'string') {
    initialSources.push(image);
  }
  const extraFallbacks = Array.isArray(fallbackList)
    ? fallbackList
    : typeof fallbackList === 'string'
    ? [fallbackList]
    : [];
  initialSources.push(...extraFallbacks);

  for (const source of initialSources) {
    const variants = buildImageVariants(source);
    if (!variants.length) {
      pushCandidate(source);
      continue;
    }
    variants.forEach(pushCandidate);
  }

  const [primary, ...fallbacks] = queue;
  return { primary, fallbacks };
}

function getLessonId() {
  if (typeof window === 'undefined') return 'lesson-01';
  const context = window.BashaLanka?.currentLesson;
  if (!context) return 'lesson-01';
  const lessonId = context.detail?.lessonId || context.detail?.id || context.meta?.lessonId || context.meta?.id;
  return lessonId || 'lesson-01';
}

function buildPictureChoiceConfig(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const si = normaliseText(entry.si);
          const en = normaliseText(entry.en);
          const translit = normaliseText(entry.translit || entry.transliteration);
          if (!si || !en || !translit) return null;
          return { si, en, translit };
        })
        .filter(Boolean)
    : [];

  if (items.length < 4) {
    throw new Error('Need at least 4 vocabulary items for PictureChoice exercise.');
  }

  const lessonId = getLessonId();
  const shuffled = shuffle([...items]);
  const correctItem = shuffled[0];
  const wrongItems = shuffled.slice(1, 4);

  const buildChoice = (item, isCorrect) => {
    const candidates = buildLessonImageSources(lessonId, item.translit);
    if (!candidates.length) {
      const fallbackSlug = toFilenameSlug(normaliseText(item.translit).toLowerCase());
      if (fallbackSlug) {
        candidates.push(`./assets/PNG/vocabulary/${lessonId}/${fallbackSlug}.png`);
      }
    }
    const resolved = resolveImageSources(candidates[0], candidates.slice(1));
    const image = resolved.primary || candidates[0];
    return {
      image,
      imageFallbacks: resolved.fallbacks,
      label: item.en,
      value: item.translit,
      isCorrect,
      alt: `Image for ${item.en}`,
    };
  };

  const choices = shuffle([
    buildChoice(correctItem, true),
    ...wrongItems.map((item) => buildChoice(item, false)),
  ]);

  return {
    prompt: correctItem.si,
    instructions: 'Select the image that matches the Sinhala word',
    choices,
    answers: [correctItem.translit],
    successMessage: `Correct! ${correctItem.si} means '${correctItem.en}'`,
    errorMessage: `Not quite. ${correctItem.si} means '${correctItem.en}'.`,
  };
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'picture-choice';

  const surface = document.createElement('div');
  surface.className = 'picture-choice__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'picture-choice__header';
  surface.appendChild(header);

  const prompt = document.createElement('h2');
  prompt.className = 'picture-choice__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  const choices = document.createElement('div');
  choices.className = 'picture-choice__choices';
  surface.appendChild(choices);
  const feedback = document.createElement('p');
  feedback.className = 'picture-choice__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'picture-choice__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  return {
    wrapper,
    choices,
    feedback,
  };
}

function createPictureButton(option, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'picture-choice__option';
  button.addEventListener('click', () => onClick(option, button));

  const image = document.createElement('img');
  image.className = 'picture-choice__image';
  image.src = option.image;
  image.alt = option.alt || option.label || '';

  const fallbackQueue = Array.isArray(option.imageFallbacks)
    ? option.imageFallbacks.slice()
    : [];
  let attemptedPlaceholder = false;

  image.addEventListener('error', () => {
    while (fallbackQueue.length) {
      const nextSrc = fallbackQueue.shift();
      if (nextSrc && nextSrc !== image.src) {
        image.src = nextSrc;
        return;
      }
    }

    if (!attemptedPlaceholder) {
      attemptedPlaceholder = true;
      image.src = PLACEHOLDER_IMAGE;
      image.alt = 'Image not available';
    }
  });

  button.appendChild(image);

  const label = document.createElement('span');
  label.className = 'picture-choice__label';
  label.textContent = option.label;
  button.appendChild(label);

  return button;
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('PictureChoice config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) {
    throw new Error('PictureChoice config requires a prompt.');
  }

  const instructions = normaliseText(rawConfig.instructions) || 'Select the picture that matches the prompt.';

  const answersLookup = createAnswerLookup(rawConfig.answers);
  const rawChoices = Array.isArray(rawConfig.choices) ? rawConfig.choices : [];
  const choices = rawChoices
@@ -159,55 +350,58 @@ function prepareConfig(rawConfig) {
        allowString: false,
      })
    )
    .filter((choice) => choice && choice.label && normaliseText(choice.image));

  choices.forEach((choice) => {
    if (choice.isCorrect) {
      addAnswerToLookup(answersLookup, choice.value || choice.label);
    }
  });

  if (!choices.length) {
    throw new Error('PictureChoice config requires at least one option with an image.');
  }

  if (!answersLookup.size) {
    throw new Error('PictureChoice config requires at least one correct answer.');
  }

  const preparedChoices = choices.map((choice) => {
    const value = choice.value || choice.label;
    const isCorrect =
      choice.isCorrect ||
      answerLookupHas(answersLookup, value) ||
      answerLookupHas(answersLookup, choice.label);
    const imageInfo = resolveImageSources(choice.image, choice.imageFallbacks || choice.fallbackImages);
    return {
      ...choice,
      label: choice.label,
      value,
      isCorrect,
      image: imageInfo.primary || choice.image,
      imageFallbacks: imageInfo.fallbacks,
    };
  });

  return {
    ...rawConfig,
    prompt,
    instructions,
    choices: preparedChoices,
    answers: Array.from(answersLookup.values()),
    successMessage: normaliseText(rawConfig.successMessage) || 'Correct! Nice work.',
    errorMessage: normaliseText(rawConfig.errorMessage) || 'Not quite, try again.',
    initialMessage: normaliseText(rawConfig.initialMessage),
  };
}

export async function initPictureChoiceExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('PictureChoice requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('PictureChoice target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  
  let rawConfig;
  
  if (configOverride) {
    rawConfig = configOverride;
  } else {
    try {
      const vocabEntries = await fetchLessonVocab();
      rawConfig = buildPictureChoiceConfig(vocabEntries);
    } catch (vocabError) {
      try {
        rawConfig = await loadConfig({ config: null, baseUrl: import.meta.url });
      } catch (configError) {
        throw new Error('PictureChoice: Unable to load vocab or config. ' + vocabError.message);
      }
    }
  }

  const config = prepareConfig(rawConfig);
  const { wrapper, choices, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const answers = new Set(config.answers.map(normaliseAnswer));
  const buttons = [];
  let completed = false;

  config.choices.forEach((choice) => {
    const button = createPictureButton(choice, (option, element) => {
      if (completed) return;
      const normalised = normaliseAnswer(option.value || option.label);
      if (answers.has(normalised)) {
        completed = true;
        element.classList.add('picture-choice__option--correct');
        buttons.forEach((btn) => {
          btn.disabled = true;
          if (btn !== element) {
            btn.classList.add('picture-choice__option--disabled');
          }
        });
        setStatusMessage(feedback, config.successMessage, 'success');
        if (typeof onComplete === 'function') {
          onComplete({ value: option });
        }
      } else {
        element.classList.add('picture-choice__option--incorrect');
        setStatusMessage(feedback, config.errorMessage, 'error');
      }
    });

    choices.appendChild(button);
    buttons.push(button);
  });

  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  return {
    buttons,
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.PictureChoice = initPictureChoiceExercise;
}

export default initPictureChoiceExercise;
