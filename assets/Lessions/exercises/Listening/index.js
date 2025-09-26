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
  createAudio,
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="listening"]';
const STYLESHEET_ID = 'listening-styles';

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'listening';

  const surface = document.createElement('div');
  surface.className = 'listening__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'listening__header';
  surface.appendChild(header);

  const prompt = document.createElement('h2');
  prompt.className = 'listening__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  const playButton = document.createElement('button');
  playButton.type = 'button';
  playButton.className = 'listening__play';
  playButton.textContent = config.playLabel || 'Play audio';
  surface.appendChild(playButton);

  const answerGroup = document.createElement('div');
  answerGroup.className = 'listening__answer';
 surface.appendChild(answerGroup);

  const feedback = document.createElement('p');
  feedback.className = 'listening__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'listening__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  return {
    wrapper,
    playButton,
    answerGroup,
    feedback,
  };
}

function renderMultipleChoice(state, config) {
  const answers = new Set(config.answers.map(normaliseAnswer));
  const buttons = config.choices.map((choice) =>
    createChoiceButton({
      label: choice.label,
      value: choice.value || choice.label,
      className: 'listening__choice',
      onClick: (value, button) => {
        if (state.completed) return;
        const normalised = normaliseAnswer(value);
        if (answers.has(normalised)) {
          state.completed = true;
          setStatusMessage(state.feedback, config.successMessage, 'success');
          buttons.forEach((btn) => {
            btn.disabled = true;
            if (btn !== button) {
              btn.classList.add('listening__choice--disabled');
            }
          });
          button.classList.add('listening__choice--correct');
          if (typeof state.onComplete === 'function') {
            state.onComplete({ value, mode: 'choice' });
          }
        } else {
          button.classList.add('listening__choice--incorrect');
          setStatusMessage(state.feedback, config.errorMessage, 'error');
        }
      },
    })
  );

  buttons.forEach((button) => state.answerGroup.appendChild(button));
  state.buttons = buttons;
}

function renderTyping(state, config) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'listening__input';
  input.placeholder = config.placeholder || 'Type what you hear';
  state.answerGroup.appendChild(input);

  const submit = document.createElement('button');
  submit.type = 'button';
  submit.className = 'listening__submit';
  submit.textContent = config.submitLabel || 'Check';
  state.answerGroup.appendChild(submit);

  submit.addEventListener('click', () => {
    if (state.completed) return;
    const attempt = normaliseAnswer(input.value);
    const answers = config.answers.map(normaliseAnswer);
    if (answers.includes(attempt)) {
      state.completed = true;
      input.disabled = true;
      submit.disabled = true;
      setStatusMessage(state.feedback, config.successMessage, 'success');
      if (typeof state.onComplete === 'function') {
        state.onComplete({ value: input.value, mode: 'typing' });
      }
    } else {
      setStatusMessage(state.feedback, config.errorMessage, 'error');
    }
  });

  state.input = input;
  state.submit = submit;
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('Listening config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) {
    throw new Error('Listening config requires a prompt.');
  }

  const instructions = normaliseText(rawConfig.instructions) || 'Listen and choose the correct answer.';
  const playLabel = normaliseText(rawConfig.playLabel) || 'Play audio';
  const playFallback = normaliseText(rawConfig.playFallback) || 'Audio unavailable';
  const placeholder = normaliseText(rawConfig.placeholder) || 'Type what you hear';
  const submitLabel = normaliseText(rawConfig.submitLabel) || 'Check';

  const answersLookup = createAnswerLookup(rawConfig.answers);
  const rawChoices = Array.isArray(rawConfig.choices) ? rawConfig.choices : [];
  const choices = rawChoices
    .map((choice) => normaliseChoiceItem(choice, { fallbackLabelKeys: ['value'] }))
    .filter((choice) => choice && choice.label);

  choices.forEach((choice) => {
    if (choice.isCorrect) {
      addAnswerToLookup(answersLookup, choice.value || choice.label);
    }
  });

  if (!answersLookup.size) {
    throw new Error('Listening config requires at least one correct answer.');
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
    playLabel,
    playFallback,
    placeholder,
    submitLabel,
    choices: preparedChoices,
    answers: Array.from(answersLookup.values()),
    successMessage: normaliseText(rawConfig.successMessage) || 'Correct! Nice work.',
    errorMessage: normaliseText(rawConfig.errorMessage) || 'Not quite, try again.',
    initialMessage: normaliseText(rawConfig.initialMessage),
  };
}

export async function initListeningExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Listening requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('Listening target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  const rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  const config = prepareConfig(rawConfig);
  const { wrapper, playButton, answerGroup, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const audio = createAudio(config.audioSrc);
  if (audio) {
    playButton.addEventListener('click', () => {
      audio.currentTime = 0;
      audio.play();
    });
  } else {
    playButton.disabled = true;
    playButton.textContent = config.playFallback || 'Audio unavailable';
  }

  const state = {
    answerGroup,
    feedback,
    onComplete,
    completed: false,
    buttons: [],
  };

  if (Array.isArray(config.choices) && config.choices.length) {
    renderMultipleChoice(state, config);
  } else {
    renderTyping(state, config);
  }

  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  return state;
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.Listening = initListeningExercise;
}

export default initListeningExercise;
