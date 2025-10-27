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
} from '../_shared/utils.js';
import { fetchLessonVocab } from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="picture-choice"]';
const STYLESHEET_ID = 'picture-choice-styles';

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

  const choices = shuffle([
    {
      image: `./assets/PNG/vocabulary/${lessonId}/${correctItem.translit.toLowerCase()}.png`,
      label: correctItem.en,
      value: correctItem.translit,
      isCorrect: true,
      alt: `Image for ${correctItem.en}`,
    },
    ...wrongItems.map((item) => ({
      image: `./assets/PNG/vocabulary/${lessonId}/${item.translit.toLowerCase()}.png`,
      label: item.en,
      value: item.translit,
      isCorrect: false,
      alt: `Image for ${item.en}`,
    })),
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
  
  image.addEventListener('error', () => {
    image.src = './assets/PNG/vocabulary/placeholder.png';
    image.alt = 'Image not available';
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
    .map((choice) =>
      normaliseChoiceItem(choice, {
        fallbackLabelKeys: ['value', 'text'],
        fallbackValueKeys: ['value', 'label'],
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
    return {
      ...choice,
      label: choice.label,
      value,
      isCorrect,
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
