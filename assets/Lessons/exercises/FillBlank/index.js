import {
  ensureStylesheet,
  loadConfig,
  normaliseAnswer,
  normaliseText,
  createAnswerLookup,
  setStatusMessage,
  createChoiceButton,
  shuffle,
} from '../_shared/utils.js';
import { fetchLessonVocab } from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="fill-blank"]';
const STYLESHEET_ID = 'fill-blank-styles';

// 🛠 Build config from lesson vocab (auto-generate for lesson simulator)
function buildFillBlankConfig(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const si = normaliseText(entry.si);
          const en = normaliseText(entry.en);
          if (!si || !en) return null;
          return { si, en };
        })
        .filter(Boolean)
    : [];

  if (items.length < 3) {
    throw new Error('FillBlank requires at least three vocab entries.');
  }

  // Pick one random item as the correct answer
  const shuffled = shuffle(items);
  const correct = shuffled[0];
  
  // Pick 2 random distractors
  const distractors = shuffled.slice(1, 3).map(item => item.en);
  const allChoices = shuffle([correct.en, ...distractors]);

  return {
    prompt: 'Complete the sentence',
    sentence: {
      before: 'The Sinhala word for',
      after: `is "${correct.si}"`,
    },
    choices: allChoices,
    answers: [correct.en],
    instructions: 'Choose the word that best completes the sentence.',
    successMessage: `Correct! ${correct.si} means "${correct.en}"`,
    errorMessage: 'Not quite, try again.',
  };
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'fill-blank';

  const surface = document.createElement('div');
  surface.className = 'fill-blank__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'fill-blank__header';
  surface.appendChild(header);

  const prompt = document.createElement('h2');
  prompt.className = 'fill-blank__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  const sentence = document.createElement('p');
  sentence.className = 'fill-blank__sentence';

  const before = document.createElement('span');
  before.className = 'fill-blank__before';
  before.textContent = config.sentence.before;
  sentence.appendChild(before);

  const blank = document.createElement('span');
  blank.className = 'fill-blank__blank';
  blank.textContent = config.blankPlaceholder || '_____';
  sentence.appendChild(blank);

  const after = document.createElement('span');
  after.className = 'fill-blank__after';
  after.textContent = config.sentence.after;
  sentence.appendChild(after);

   surface.appendChild(sentence);

  const choices = document.createElement('div');
  choices.className = 'fill-blank__choices';
  surface.appendChild(choices);

  const feedback = document.createElement('p');
  feedback.className = 'fill-blank__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  const instructions = document.createElement('p');
  instructions.className = 'fill-blank__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  return {
    wrapper,
    blank,
    choices,
    feedback,
  };
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('FillBlank config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) {
    throw new Error('FillBlank config requires a prompt.');
  }

  const sentenceBefore = normaliseText(rawConfig?.sentence?.before);
  const sentenceAfter = normaliseText(rawConfig?.sentence?.after);
  if (!sentenceBefore && !sentenceAfter) {
    throw new Error('FillBlank config requires sentence text.');
  }

  const rawChoices = Array.isArray(rawConfig.choices) ? rawConfig.choices : [];
  const choices = rawChoices
    .map((choice) => normaliseText(choice))
    .filter(Boolean);

  if (!choices.length) {
    throw new Error('FillBlank config requires at least one choice.');
  }

  const answersLookup = createAnswerLookup(rawConfig.answers);
  if (!answersLookup.size) {
    throw new Error('FillBlank config requires at least one correct answer.');
  }

  return {
    ...rawConfig,
    prompt,
    sentence: {
      before: sentenceBefore,
      after: sentenceAfter,
    },
    choices,
    answers: Array.from(answersLookup.values()),
    instructions: normaliseText(rawConfig.instructions) || 'Choose the word that best completes the sentence.',
    blankPlaceholder: normaliseText(rawConfig.blankPlaceholder) || '_____',
    successMessage: normaliseText(rawConfig.successMessage) || 'Correct! Nice work.',
    errorMessage: normaliseText(rawConfig.errorMessage) || 'Not quite, try again.',
    initialMessage: normaliseText(rawConfig.initialMessage),
  };
}

export async function initFillBlankExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('FillBlank requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('FillBlank target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  
  // Try to load config - either from override, or auto-generate from lesson vocab
  let rawConfig;
  if (configOverride) {
    rawConfig = configOverride;
  } else {
    try {
      // Try to auto-generate config from lesson vocabulary (like MatchPairs does)
      const vocabEntries = await fetchLessonVocab();
      rawConfig = buildFillBlankConfig(vocabEntries);
    } catch (vocabError) {
      // Fallback to loading config.json if vocab fetch fails
      try {
        rawConfig = await loadConfig({ config: null, baseUrl: import.meta.url });
      } catch (configError) {
        throw new Error(`FillBlank: Cannot auto-generate from vocab (${vocabError.message}), and no config.json found (${configError.message}).`);
      }
    }
  }
  
  const config = prepareConfig(rawConfig);
  const { wrapper, blank, choices, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const answers = new Set(config.answers.map(normaliseAnswer));
  let completed = false;

  const buttons = config.choices.map((choice) =>
    createChoiceButton({
      label: choice,
      value: choice,
      className: 'fill-blank__choice',
      onClick: (value, button) => {
        if (completed) return;
        const normalised = normaliseAnswer(value);
        blank.textContent = value;
        if (answers.has(normalised)) {
          completed = true;
          button.classList.add('fill-blank__choice--correct');
          buttons.forEach((btn) => {
            btn.disabled = true;
            if (btn !== button) {
              btn.classList.add('fill-blank__choice--disabled');
            }
          });
          setStatusMessage(feedback, config.successMessage, 'success');
          if (typeof onComplete === 'function') {
            onComplete({ value });
          }
        } else {
          button.classList.add('fill-blank__choice--incorrect');
          setStatusMessage(feedback, config.errorMessage, 'error');
        }
      },
    })
  );

  buttons.forEach((button) => choices.appendChild(button));
  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  return {
    buttons,
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.FillBlank = initFillBlankExercise;
}

export default initFillBlankExercise;
