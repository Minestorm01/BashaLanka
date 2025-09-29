import {
  ensureStylesheet,
  normaliseText,
  shuffle,
  setStatusMessage,
} from '../_shared/utils.js';
import { fetchLessonVocab } from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="match-pairs"]';
const STYLESHEET_ID = 'match-pairs-styles';

// 🛠 Build config from lesson vocab
function buildMatchPairsConfig(vocabEntries) {
  const items = Array.isArray(vocabEntries)
    ? vocabEntries
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const base = normaliseText(entry.si) || entry.si;
          const target = normaliseText(entry.en) || entry.en;
          const translit = normaliseText(entry.translit || entry.transliteration);
          if (!base || !target) return null;
          return { base, target, translit };
        })
        .filter(Boolean)
    : [];

  if (items.length < 2) {
    throw new Error('MatchPairs requires at least two vocab entries.');
  }

  // If more than 5 entries → take random 5
  // Otherwise → just use all available
  const selected = items.length > 5 ? shuffle(items).slice(0, 5) : items;

  return {
    prompt: 'Match the pairs',
    instructions: 'Match the Sinhala words with their English meanings.',
    successMessage: 'Great match!',
    errorMessage: 'Try again.',
    initialMessage: 'Start matching to continue.',
    pairs: selected.map((entry) => ({
      base: entry.base,
      target: entry.target,
      translit: entry.translit,
    })),
  };
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'match-pairs';

  const surface = document.createElement('div');
  surface.className = 'match-pairs__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'match-pairs__header';
  surface.appendChild(header);

  const prompt = document.createElement('h2');
  prompt.className = 'match-pairs__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  const instructions = document.createElement('p');
  instructions.className = 'match-pairs__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  const grid = document.createElement('div');
  grid.className = 'match-pairs__grid';
  surface.appendChild(grid);

  const targetColumn = document.createElement('div');
  targetColumn.className = 'match-pairs__column match-pairs__column--target';
  grid.appendChild(targetColumn);

  const baseColumn = document.createElement('div');
  baseColumn.className = 'match-pairs__column match-pairs__column--base';
  grid.appendChild(baseColumn);

  const feedback = document.createElement('p');
  feedback.className = 'match-pairs__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  return {
    wrapper,
    targetColumn,
    baseColumn,
    feedback,
  };
}

function createCard(content, matchId, type) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'match-pairs__card';
  button.classList.add(`match-pairs__card--${type}`);
  button.dataset.matchId = String(matchId);
  button.dataset.cardType = type;

  if (type === 'base') {
    const script = document.createElement('span');
    script.className = 'match-pairs__card-script';
    script.textContent = content.label;
    button.appendChild(script);

    if (content.translit) {
      const transliteration = document.createElement('span');
      transliteration.className = 'match-pairs__card-translit';
      transliteration.textContent = content.translit;
      button.appendChild(transliteration);
    }
  } else {
    const label = document.createElement('span');
    label.className = 'match-pairs__card-label';
    label.textContent = content.label;
    button.appendChild(label);
  }

  return button;
}

export async function initMatchPairsExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('MatchPairs requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('MatchPairs target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });

  let rawConfig;
  if (configOverride && typeof configOverride === 'object') {
    rawConfig = configOverride;
  } else {
    const vocab = await fetchLessonVocab();
    rawConfig = buildMatchPairsConfig(vocab);
  }

  const config = rawConfig;
  const { wrapper, targetColumn, baseColumn, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const targetCards = [];
  const baseCards = [];
  config.pairs.forEach((pair, index) => {
    baseCards.push(createCard({ label: pair.base, translit: pair.translit }, index, 'base'));
    targetCards.push(createCard({ label: pair.target }, index, 'target'));
  });

  shuffle(targetCards).forEach((card) => targetColumn.appendChild(card));
  shuffle(baseCards).forEach((card) => baseColumn.appendChild(card));

  const cards = [...targetCards, ...baseCards];

  let first = null;
  let locked = false;
  let matched = 0;
  const totalMatches = config.pairs.length;

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      if (locked || card.classList.contains('match-pairs__card--matched')) {
        return;
      }

      if (!first) {
        first = card;
        card.classList.add('match-pairs__card--selected');
        return;
      }

      if (card === first) {
        card.classList.remove('match-pairs__card--selected');
        first = null;
        return;
      }

      locked = true;
      const match = card.dataset.matchId === first.dataset.matchId;
      if (match && card.dataset.cardType !== first.dataset.cardType) {
        card.classList.add('match-pairs__card--matched');
        first.classList.add('match-pairs__card--matched');
        card.disabled = true;
        first.disabled = true;
        matched += 1;
        setStatusMessage(feedback, config.successMessage, 'success');
        if (matched === totalMatches && typeof onComplete === 'function') {
          onComplete({});
        }
        window.setTimeout(() => {
          first?.classList.remove('match-pairs__card--selected');
          first = null;
          locked = false;
        }, 350);
      } else {
        card.classList.add('match-pairs__card--wrong');
        setStatusMessage(feedback, config.errorMessage, 'error');
        window.setTimeout(() => {
          card.classList.remove('match-pairs__card--wrong');
          card.classList.remove('match-pairs__card--selected');
          first?.classList.remove('match-pairs__card--selected');
          first = null;
          locked = false;
        }, 650);
      }
    });
  });

  setStatusMessage(feedback, config.initialMessage || '', 'neutral');

  return {
    cards,
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.MatchPairs = initMatchPairsExercise;
}

export default initMatchPairsExercise;