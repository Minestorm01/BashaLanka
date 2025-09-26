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
  createChoiceButton,
  formatBadge,
} from '../_shared/utils.js';

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
  const rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
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
