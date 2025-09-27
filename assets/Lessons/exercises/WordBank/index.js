import {
  ensureStylesheet,
  loadConfig,
  normaliseAnswer,
  normaliseText,
  createAnswerLookup,
  shuffle,
  setStatusMessage,
  createTile,
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank"]';
const STYLESHEET_ID = 'word-bank-styles';

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank';

  const surface = document.createElement('div');
  surface.className = 'word-bank__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'word-bank__header';
  surface.appendChild(header);

  const prompt = document.createElement('h2');
  prompt.className = 'word-bank__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  const instructions = document.createElement('p');
  instructions.className = 'word-bank__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  assembled.setAttribute('role', 'list');
  surface.appendChild(assembled);

  const bank = document.createElement('div');
  bank.className = 'word-bank__bank';
  bank.setAttribute('role', 'list');
  surface.appendChild(bank);

  const footer = document.createElement('footer');
  footer.className = 'word-bank__footer';
  surface.appendChild(footer);

  const check = document.createElement('button');
  check.type = 'button';
  check.className = 'word-bank__check';
  check.textContent = config.submitLabel || 'Check';
  footer.appendChild(check);

  const clear = document.createElement('button');
  clear.type = 'button';
  clear.className = 'word-bank__reset';
  clear.textContent = config.resetLabel || 'Reset';
  footer.appendChild(clear);

  const feedback = document.createElement('p');
  feedback.className = 'word-bank__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  return {
    wrapper,
    assembled,
    bank,
    check,
    clear,
    feedback,
  };
}

function renderTiles(state) {
  const { config, bank, assembledTiles, bankTiles } = state;

  bank.innerHTML = '';
  assembledTiles.innerHTML = '';

  state.availableTiles.forEach((word) => {
    const tile = createTile(word);
    tile.addEventListener('click', () => {
      if (tile.disabled || state.completed) return;
      tile.disabled = true;
      tile.classList.add('word-bank__tile--used');
      state.selection.push(word);
      updateAssembled(state);
    });
    bank.appendChild(tile);
    bankTiles.push(tile);
  });
}

function updateAssembled(state) {
  const { assembledTiles, selection } = state;
  assembledTiles.innerHTML = '';
  selection.forEach((word, index) => {
    const tile = createTile(word);
    tile.classList.add('word-bank__tile--assembled');
    tile.addEventListener('click', () => {
      if (state.completed) return;
      state.selection.splice(index, 1);
      const original = state.bankTiles.find((btn) => btn.dataset.tileValue === word);
      if (original) {
        original.disabled = false;
        original.classList.remove('word-bank__tile--used');
      }
      updateAssembled(state);
    });
    assembledTiles.appendChild(tile);
  });
}

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('WordBank config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) {
    throw new Error('WordBank config requires a prompt.');
  }

  const instructions = normaliseText(rawConfig.instructions) || 'Arrange the tiles to complete the sentence.';

  const rawTiles = Array.isArray(rawConfig.wordBank)
    ? rawConfig.wordBank
    : Array.isArray(rawConfig.choices)
    ? rawConfig.choices
    : [];

  const tiles = rawTiles
    .map((tile) => normaliseText(tile))
    .filter(Boolean);

  if (!tiles.length) {
    throw new Error('WordBank config requires at least one tile.');
  }

  const answersLookup = createAnswerLookup(rawConfig.answers);
  if (!answersLookup.size) {
    throw new Error('WordBank config requires at least one correct answer.');
  }

  return {
    ...rawConfig,
    prompt,
    instructions,
    wordBank: tiles,
    answers: Array.from(answersLookup.values()),
    successMessage: normaliseText(rawConfig.successMessage) || 'Correct! Nice work.',
    errorMessage: normaliseText(rawConfig.errorMessage) || 'Not quite, try again.',
    initialMessage: normaliseText(rawConfig.initialMessage),
    submitLabel: normaliseText(rawConfig.submitLabel) || 'Check',
    resetLabel: normaliseText(rawConfig.resetLabel) || 'Reset',
  };
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
  const rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  const config = prepareConfig(rawConfig);
  const { wrapper, assembled, bank, check, clear, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const state = {
    config,
    assembledTiles: assembled,
    bank,
    bankTiles: [],
    selection: [],
    availableTiles: shuffle(config.wordBank || []),
    feedback,
    completed: false,
  };

  renderTiles(state);
  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  check.addEventListener('click', () => {
    if (state.completed) return;
    const attempt = normaliseAnswer(state.selection.join(' '));
    const answers = (config.answers || []).map(normaliseAnswer);
    if (answers.includes(attempt)) {
      state.completed = true;
      setStatusMessage(feedback, config.successMessage, 'success');
      check.disabled = true;
      clear.disabled = true;
      if (typeof onComplete === 'function') {
        onComplete({ value: state.selection.slice() });
      }
    } else {
      setStatusMessage(feedback, config.errorMessage, 'error');
    }
  });

  clear.addEventListener('click', () => {
    if (state.completed) return;
    state.selection = [];
    state.bankTiles.forEach((tile) => {
      tile.disabled = false;
      tile.classList.remove('word-bank__tile--used');
    });
    updateAssembled(state);
    setStatusMessage(feedback, config.initialMessage || '', 'neutral');
  });

  return state;
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBank = initWordBankExercise;
}

export default initWordBankExercise;
