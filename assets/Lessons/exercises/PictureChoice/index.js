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
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="picture-choice"]';
const STYLESHEET_ID = 'picture-choice-styles';

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
  const rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
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
