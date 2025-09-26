import {
  ensureStylesheet,
  loadConfig,
  normaliseAnswer,
  normaliseText,
  createAnswerLookup,
  setStatusMessage,
  supportsSpeechRecognition,
  createSpeechRecognizer,
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="speak"]';
const STYLESHEET_ID = 'speak-styles';

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'speak';

  const surface = document.createElement('div');
  surface.className = 'speak__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'speak__header';
  surface.appendChild(header);

  const prompt = document.createElement('h2');
  prompt.className = 'speak__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  if (config.transliteration) {
    const transliteration = document.createElement('p');
    transliteration.className = 'speak__transliteration';
    transliteration.textContent = config.transliteration;
    surface.appendChild(transliteration);
  }

  const instructions = document.createElement('p');
  instructions.className = 'speak__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'speak__button';
  button.textContent = config.startLabel || 'Start speaking';
  surface.appendChild(button);

  const feedback = document.createElement('p');
  feedback.className = 'speak__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  const transcript = document.createElement('p');
  transcript.className = 'speak__transcript';
  transcript.textContent = '';
  surface.appendChild(transcript);

  return {
    wrapper,
    button,
    feedback,
    transcript,
  };
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('Speak config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) {
    throw new Error('Speak config requires a prompt.');
  }

  const instructions = normaliseText(rawConfig.instructions) || 'Tap start and say the phrase aloud.';
  const transliteration = normaliseText(rawConfig.transliteration);
  const answersLookup = createAnswerLookup(rawConfig.answers);

  if (!answersLookup.size) {
    throw new Error('Speak config requires at least one correct answer.');
  }

  return {
    ...rawConfig,
    prompt,
    instructions,
    transliteration,
    answers: Array.from(answersLookup.values()),
    lang: normaliseText(rawConfig.lang) || 'si-LK',
    startLabel: normaliseText(rawConfig.startLabel) || 'Start speaking',
    retryLabel: normaliseText(rawConfig.retryLabel) || 'Try again',
    listeningMessage: normaliseText(rawConfig.listeningMessage) || 'Listening…',
    successMessage: normaliseText(rawConfig.successMessage) || 'Great pronunciation!',
    errorMessage: normaliseText(rawConfig.errorMessage) || 'Try again.',
    initialMessage: normaliseText(rawConfig.initialMessage),
    unsupportedLabel: normaliseText(rawConfig.unsupportedLabel) || 'Speech recognition not supported in this browser',
    unsupportedMessage:
      normaliseText(rawConfig.unsupportedMessage) || 'Try this exercise on a device with microphone access.',
  };
}

export async function initSpeakExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Speak exercises require a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('Speak target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  const rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  const config = prepareConfig(rawConfig);
  const { wrapper, button, feedback, transcript } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const supported = supportsSpeechRecognition();
  if (!supported) {
    button.disabled = true;
    button.textContent = config.unsupportedLabel;
    setStatusMessage(feedback, config.unsupportedMessage, 'error');
    return { supported: false };
  }

  const answers = config.answers.map(normaliseAnswer);
  const recognizer = createSpeechRecognizer({ lang: config.lang || 'si-LK', maxAlternatives: 5 });
  let listening = false;
  let completed = false;

  recognizer.addEventListener('result', (event) => {
    if (!event.results) return;
    const transcripts = [];
    for (let i = 0; i < event.results.length; i += 1) {
      const result = event.results[i];
      for (let j = 0; j < result.length; j += 1) {
        transcripts.push(result[j].transcript);
      }
    }

    const combined = transcripts.join(' / ');
    transcript.textContent = combined;
    const normalised = transcripts.map(normaliseAnswer);
    if (normalised.some((value) => answers.includes(value))) {
      completed = true;
      setStatusMessage(feedback, config.successMessage, 'success');
      button.disabled = true;
      recognizer.stop();
      if (typeof onComplete === 'function') {
        onComplete({ transcripts });
      }
    } else {
      setStatusMessage(feedback, config.errorMessage, 'error');
    }
  });

  recognizer.addEventListener('end', () => {
    listening = false;
    if (!completed) {
      button.disabled = false;
    button.textContent = config.retryLabel;
    }
  });

  recognizer.addEventListener('error', (event) => {
    listening = false;
    button.disabled = false;
    setStatusMessage(feedback, `${config.errorMessage || 'Something went wrong.'} (${event.error})`, 'error');
  });

  button.addEventListener('click', () => {
    if (listening || completed) return;
    transcript.textContent = '';
    setStatusMessage(feedback, config.listeningMessage || 'Listening…', 'neutral');
    button.disabled = true;
    listening = true;
    try {
      recognizer.start();
    } catch (error) {
      listening = false;
      button.disabled = false;
      setStatusMessage(feedback, config.errorMessage || 'Unable to start recording.', 'error');
    }
  });

  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  return {
    recognizer,
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.Speak = initSpeakExercise;
}

export default initSpeakExercise;
