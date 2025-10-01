import {
  ensureStylesheet,
  shuffle,
  setStatusMessage,
  normaliseText,
} from '../_shared/utils.js';
import {
  fetchAllLessonVocabsUpTo,
} from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank"]';
const STYLESHEET_ID = 'word-bank-styles';

// 🛠 Build config from vocab
export function buildWordBankConfig(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries.filter((entry) => entry && entry.si && entry.en)
    : [];

  if (!items.length) {
    throw new Error('WordBank requires at least one vocab entry.');
  }

  // Each lesson should define prompts in its .md file eventually
  // For now, just create sentences using single words as valid answers
  const sample = shuffle(items).slice(0, 6);

  return {
    prompt: 'Form the sentence',
    instructions: 'Tap the words to build the sentence.',
    answers: sample.map((entry) => entry.si),
    bank: shuffle(sample.map((entry) => entry.si)),
    successMessage: 'Correct! Well done.',
    errorMessage: 'Not quite, try again.',
    initialMessage: 'Build the sentence to continue.',
  };
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank';

  const surface = document.createElement('div');
  surface.className = 'word-bank__surface';
  wrapper.appendChild(surface);

  // Header with mascot + bubble
  const header = document.createElement('div');
  header.className = 'word-bank__header';
  surface.appendChild(header);

  const mascot = document.createElement('img');
  mascot.className = 'word-bank__mascot';
  mascot.src = 'assets/sections/section-1/mascot.svg'; // default fallback
  mascot.alt = 'Lesson mascot';
  header.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank__bubble';
  header.appendChild(bubble);

  const prompt = document.createElement('h2');
  prompt.className = 'word-bank__prompt';
  prompt.textContent = config.prompt;
  bubble.appendChild(prompt);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  bubble.appendChild(assembled);

  const instructions = document.createElement('p');
  instructions.className = 'word-bank__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  const bank = document.createElement('div');
  bank.className = 'word-bank__bank';
  surface.appendChild(bank);

  const controls = document.createElement('div');
  controls.className = 'word-bank__controls';
  surface.appendChild(controls);

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'word-bank__btn word-bank__btn--check';
  checkBtn.textContent = 'Check';
  controls.appendChild(checkBtn);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'word-bank__btn word-bank__btn--reset';
  resetBtn.textContent = 'Reset';
  controls.appendChild(resetBtn);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  return {
    wrapper,
    assembled,
    bank,
    checkBtn,
    resetBtn,
    feedback,
  };
}

function createTile(label) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'word-bank__tile';
  btn.textContent = label;
  return btn;
}

export async function initWordBankExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('WordBank requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('WordBank target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  let rawConfig;

  if (configOverride) {
    rawConfig = configOverride;
  } else {
    const lessonContext = window.BashaLanka?.currentLesson || {};
    const lessonDetail = lessonContext.detail || {};
    const currentLessonNumber = lessonDetail.lessonNumber || 1;

    const vocab = await fetchAllLessonVocabsUpTo(currentLessonNumber);
    rawConfig = buildWordBankConfig(vocab);
  }

  const config = rawConfig;
  const { wrapper, assembled, bank, checkBtn, resetBtn, feedback } =
    buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const tiles = config.bank.map((word) => createTile(word));
  tiles.forEach((tile) => bank.appendChild(tile));

  // tile movement
  tiles.forEach((tile) => {
    tile.addEventListener('click', () => {
      if (tile.parentElement === bank) {
        assembled.appendChild(tile);
      } else {
        bank.appendChild(tile);
      }
    });
  });

  // reset
  resetBtn.addEventListener('click', () => {
    tiles.forEach((tile) => bank.appendChild(tile));
    setStatusMessage(feedback, config.initialMessage, 'neutral');
  });

  // check
  checkBtn.addEventListener('click', () => {
    const attempt = Array.from(assembled.children).map((t) =>
      normaliseText(t.textContent)
    );
    const correct = config.answers.map((ans) => normaliseText(ans));

    if (attempt.join(' ') === correct.join(' ')) {
      setStatusMessage(feedback, config.successMessage, 'success');
      tiles.forEach((tile) => (tile.disabled = true));
      if (typeof onComplete === 'function') {
        onComplete({ value: attempt });
      }
    } else {
      setStatusMessage(feedback, config.errorMessage, 'error');
    }
  });

  setStatusMessage(feedback, config.initialMessage, 'neutral');

  return {
    tiles,
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBank = initWordBankExercise;
}

export default initWordBankExercise;