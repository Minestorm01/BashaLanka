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
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="translate-to-target"]';
const STYLESHEET_ID = 'translate-to-target-styles';

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'translate-to-target';

  const surface = document.createElement('div');
  surface.className = 'translate-to-target__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'translate-to-target__header';
  surface.appendChild(header);

  const badge = document.createElement('span');
  badge.className = 'translate-to-target__badge';
  badge.textContent = config.badge || 'TRANSLATE';
  header.appendChild(badge);

  const prompt = document.createElement('h2');
  prompt.className = 'translate-to-target__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  const source = document.createElement('p');
  source.className = 'translate-to-target__source';
  source.textContent = config.source;
  surface.appendChild(source);

  const answerGroup = document.createElement('div');
  answerGroup.className = 'translate-to-target__answer';
  surface.appendChild(answerGroup);

  const feedback = document.createElement('p');
  feedback.className = 'translate-to-target__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  const footer = document.createElement('footer');
  footer.className = 'translate-to-target__footer';
  surface.appendChild(footer);

  const instructions = document.createElement('p');
  instructions.className = 'translate-to-target__instructions';
  instructions.textContent = config.instructions;
  footer.appendChild(instructions);

  return {
    wrapper,
    answerGroup,
    feedback,
  };
}

function renderMultipleChoice(state, config) {
  const { answerGroup } = state;
  answerGroup.innerHTML = '';
  answerGroup.classList.add('translate-to-target__choices');

  const answers = new Set(config.answers.map(normaliseAnswer));

  const buttons = config.choices.map((choice) =>
    createChoiceButton({
      label: choice.label,
      value: choice.value || choice.label,
      className: 'translate-to-target__choice',
      onClick: (value, button) => {
        if (state.completed) return;
        const normalised = normaliseAnswer(value);
        if (answers.has(normalised)) {
          state.completed = true;
          setStatusMessage(state.feedback, config.successMessage, 'success');
          button.classList.add('translate-to-target__choice--correct');
          state.buttons.forEach((btn) => {
            if (btn !== button) {
              btn.disabled = true;
              btn.classList.add('translate-to-target__choice--disabled');
            }
          });
          if (typeof state.onComplete === 'function') {
            state.onComplete({ value, mode: 'choice' });
          }
        } else {
          button.classList.add('translate-to-target__choice--incorrect');
          setStatusMessage(state.feedback, config.errorMessage, 'error');
        }
      },
    })
  );

  buttons.forEach((button) => answerGroup.appendChild(button));
  state.buttons = buttons;
}

function renderTyping(state, config) {
  const { answerGroup } = state;
  answerGroup.innerHTML = '';
  answerGroup.classList.remove('translate-to-target__choices');

  const input = document.createElement('textarea');
  input.className = 'translate-to-target__input';
  input.rows = 3;
  input.placeholder = config.placeholder || 'Type your translation';
  answerGroup.appendChild(input);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'translate-to-target__submit';
  submit.textContent = config.submitLabel || 'Check';
  answerGroup.appendChild(submit);

  submit.addEventListener('click', () => {
    if (state.completed) return;
    const value = input.value;
    const normalised = normaliseAnswer(value);
    const answers = config.answers.map(normaliseAnswer);
    if (answers.includes(normalised)) {
      state.completed = true;
      input.disabled = true;
      submit.disabled = true;
      setStatusMessage(state.feedback, config.successMessage, 'success');
      if (typeof state.onComplete === 'function') {
        state.onComplete({ value, mode: 'typing' });
      }
    } else {
      setStatusMessage(state.feedback, config.errorMessage, 'error');
    }
  });

  state.input = input;
  state.submit = submit;
}

export async function initTranslateToTargetExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('TranslateToTarget requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('TranslateToTarget target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  const rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  const config = prepareConfig(rawConfig);
  const { wrapper, answerGroup, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const state = {
    answerGroup,
    feedback,
    onComplete,
    completed: false,
    buttons: [],
  };

  if (config.mode === 'multiple-choice') {
    renderMultipleChoice(state, config);
  } else {
    renderTyping(state, config);
  }

  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  return state;
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('TranslateToTarget config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  const source = normaliseText(rawConfig.source);
  if (!prompt || !source) {
    throw new Error('TranslateToTarget config requires a prompt and source sentence.');
  }

  const badge = normaliseText(rawConfig.badge) || 'TRANSLATE';
  const mode = normaliseText(rawConfig.mode).toLowerCase() === 'typing' ? 'typing' : 'multiple-choice';
  const instructions = normaliseText(rawConfig.instructions) ||
    (mode === 'typing' ? 'Type the translation.' : 'Select the matching translation.');
  const successMessage = normaliseText(rawConfig.successMessage) || 'Correct! Nice work.';
  const errorMessage = normaliseText(rawConfig.errorMessage) || 'Not quite, try again.';
  const initialMessage = normaliseText(rawConfig.initialMessage);
  const placeholder = normaliseText(rawConfig.placeholder) || 'Type your translation';
  const submitLabel = normaliseText(rawConfig.submitLabel) || 'Check';

  const answersLookup = createAnswerLookup(rawConfig.answers);

  let choices = [];
  if (mode === 'multiple-choice') {
    const rawChoices = Array.isArray(rawConfig.choices) ? rawConfig.choices : [];
    choices = rawChoices
      .map((choice) =>
        normaliseChoiceItem(choice, {
          fallbackLabelKeys: ['si', 'en', 'text'],
          fallbackValueKeys: ['si', 'value', 'label'],
        })
      )
      .filter((choice) => choice && choice.label);

    if (!choices.length) {
      throw new Error('TranslateToTarget multiple-choice config requires at least one choice.');
    }

    choices.forEach((choice) => {
      if (choice.isCorrect) {
        addAnswerToLookup(answersLookup, choice.value || choice.label);
      }
    });
  }

  if (!answersLookup.size) {
    throw new Error('TranslateToTarget config requires at least one correct answer.');
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
    source,
    badge,
    mode,
    instructions,
    successMessage,
    errorMessage,
    initialMessage,
    placeholder,
    submitLabel,
    choices: preparedChoices,
    answers: Array.from(answersLookup.values()),
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.TranslateToTarget = initTranslateToTargetExercise;
}

export default initTranslateToTargetExercise;
