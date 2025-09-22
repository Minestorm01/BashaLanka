const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="translate-to-base"]';
const STYLESHEET_ID = 'translate-to-base-stylesheet';

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

  return null;
}

async function loadConfig(customConfig) {
  const resolved = await resolveConfigSource(customConfig);

  if (!resolved) {
    throw new Error(
      'TranslateToBase requires a lesson-provided config. Pass the exercise_translateToBase block to initTranslateToBaseExercise().',
    );
  }

  return resolved;
}

function validateConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('TranslateToBase config must resolve to an object.');
  }

  if (!config.prompt || String(config.prompt).trim().length === 0) {
    throw new Error('TranslateToBase config requires a prompt.');
  }
}

function resolveMascotSrc(config) {
  const fallback = new URL('../../assets/sections/section-1/mascot.svg', import.meta.url).toString();
  if (!config || !config.mascot) {
    return fallback;
  }

  try {
    return new URL(config.mascot, import.meta.url).toString();
  } catch (error) {
    console.warn('Unable to resolve custom mascot asset for TranslateToBase exercise.', error);
    return fallback;
  }
}

function createFeedbackElement() {
  const feedback = document.createElement('p');
  feedback.className = 'translate-to-base__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  return feedback;
}

function createExerciseLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'translate-to-base';

  const surface = document.createElement('div');
  surface.className = 'translate-to-base__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('div');
  header.className = 'translate-to-base__header';
  surface.appendChild(header);

  const mascot = document.createElement('img');
  mascot.className = 'translate-to-base__mascot';
  mascot.src = resolveMascotSrc(config);
  mascot.alt = config.mascotAlt || 'Mascot for this lesson';
  header.appendChild(mascot);

  const promptGroup = document.createElement('div');
  promptGroup.className = 'translate-to-base__prompt-group';
  header.appendChild(promptGroup);

  const prompt = document.createElement('h2');
  prompt.className = 'translate-to-base__prompt';
  prompt.textContent = config.prompt || '';
  promptGroup.appendChild(prompt);

  if (config.transliteration) {
    const transliteration = document.createElement('p');
    transliteration.className = 'translate-to-base__transliteration';
    transliteration.textContent = config.transliteration;
    promptGroup.appendChild(transliteration);
  }

  const choicesContainer = document.createElement('div');
  choicesContainer.className = 'translate-to-base__choices';
  surface.appendChild(choicesContainer);

  const feedback = createFeedbackElement();
  surface.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'translate-to-base__instructions';
  instructions.textContent = config.instructions || 'Tap the correct English meaning from the list.';
  surface.appendChild(instructions);

  return {
    wrapper,
    choicesContainer,
    feedback,
  };
}

function setFeedback(feedbackElement, { success, message }) {
  feedbackElement.textContent = message || '';
  feedbackElement.classList.remove('translate-to-base__feedback--success', 'translate-to-base__feedback--error');
  if (success === true) {
    feedbackElement.classList.add('translate-to-base__feedback--success');
  } else if (success === false) {
    feedbackElement.classList.add('translate-to-base__feedback--error');
  }
}

function handleSuccess(state, selectedButton) {
  const { container, choiceButtons, onComplete, config } = state;
  state.completed = true;
  container.classList.add('translate-to-base--completed');

  choiceButtons.forEach((button) => {
    button.classList.remove('translate-to-base__choice--selected', 'translate-to-base__choice--incorrect');
    if (button === selectedButton) {
      button.classList.add('translate-to-base__choice--correct');
    } else {
      button.classList.add('translate-to-base__choice--disabled');
    }
    button.disabled = true;
  });

  setFeedback(state.feedback, {
    success: true,
    message: config.successMessage || 'Correct! Well done.',
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
      btn.classList.remove('translate-to-base__choice--incorrect', 'translate-to-base__choice--selected');
    }
  });

  button.classList.add('translate-to-base__choice--selected');
  button.classList.remove('translate-to-base__choice--incorrect');

  if (answers.has(normalised)) {
    handleSuccess(state, button);
    return;
  }

  button.classList.add('translate-to-base__choice--incorrect');
  setFeedback(feedback, {
    success: false,
    message: config.errorMessage || 'Not quite right. Try again!',
  });
}

function prepareChoices(config) {
  const rawChoices = Array.isArray(config.choices) ? config.choices : [];

  const processed = rawChoices
    .map((choice) => {
      if (!choice && choice !== 0) {
        return null;
      }

      if (typeof choice === 'string' || typeof choice === 'number') {
        return {
          label: String(choice),
          isCorrect: false,
        };
      }

      if (typeof choice === 'object') {
        const label = choice.label ?? choice.value;
        if (!label && label !== 0) {
          return null;
        }
        return {
          label: String(label),
          isCorrect: Boolean(choice.isCorrect),
        };
      }

      return null;
    })
    .filter((choice) => choice && choice.label.trim().length > 0);

  if (!processed.length) {
    throw new Error('TranslateToBase config requires at least one choice.');
  }

  return processed;
}

function collectCorrectAnswers(config, choices) {
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
    throw new Error('TranslateToBase config requires at least one correct answer.');
  }

  return answers;
}

function createChoiceButton(choice, state) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'translate-to-base__choice';
  button.textContent = choice.label;
  button.dataset.choiceValue = choice.label;

  button.addEventListener('click', () => handleAttempt(state, choice, button));
  return button;
}

export async function initTranslateToBaseExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('TranslateToBase exercises require a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride = null,
    onComplete = null,
  } = options;

  if (!target) {
    throw new Error('TranslateToBase exercise target element not found.');
  }

  ensureStylesheet();
  const config = await loadConfig(configOverride);
  validateConfig(config);
  const choices = prepareChoices(config);
  const answers = collectCorrectAnswers(config, choices);

  const { wrapper, choicesContainer, feedback } = createExerciseLayout(config);
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
  window.BashaLanka.exercises.TranslateToBase = initTranslateToBaseExercise;

  document.addEventListener('DOMContentLoaded', () => {
    const autoRoot = document.querySelector(DEFAULT_CONTAINER_SELECTOR);
    if (!autoRoot || autoRoot.dataset.translateToBaseInitialised) {
      return;
    }

    let inlineConfig = null;

    if (autoRoot.translateToBaseConfig && typeof autoRoot.translateToBaseConfig === 'object') {
      inlineConfig = autoRoot.translateToBaseConfig;
    } else if (autoRoot.dataset.translateToBaseConfig) {
      try {
        inlineConfig = JSON.parse(autoRoot.dataset.translateToBaseConfig);
      } catch (error) {
        console.error('Failed to parse inline TranslateToBase config from dataset.', error);
      }
    }

    if (!inlineConfig) {
      return;
    }

    autoRoot.dataset.translateToBaseInitialised = 'true';
    initTranslateToBaseExercise({ target: autoRoot, config: inlineConfig }).catch((error) => {
      console.error('Failed to initialise TranslateToBase exercise', error);
    });
  });
}

export default initTranslateToBaseExercise;
