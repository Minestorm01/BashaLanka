import {
  ensureStylesheet,
  loadConfig,
  shuffle,
  setStatusMessage,
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="match-pairs"]';
const STYLESHEET_ID = 'match-pairs-styles';

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

  const feedback = document.createElement('p');
  feedback.className = 'match-pairs__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  return {
    wrapper,
    grid,
    feedback,
  };
}

function createCard(content, matchId, type) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'match-pairs__card';
  button.dataset.matchId = String(matchId);
  button.dataset.cardType = type;

  const label = document.createElement('span');
  label.className = 'match-pairs__card-label';
  label.textContent = content;
  button.appendChild(label);

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

  ensureStylesheet(STYLESHEET_ID, './styles.css');
  const config = await loadConfig({ config: configOverride });
  const { wrapper, grid, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const cards = [];
  config.pairs.forEach((pair, index) => {
    cards.push(createCard(pair.base, index, 'base'));
    cards.push(createCard(pair.target, index, 'target'));
  });

  shuffle(cards).forEach((card) => grid.appendChild(card));

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
          card.classList.remove('match-pairs__card--selected');
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
