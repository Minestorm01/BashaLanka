import {
  ensureStylesheet,
  loadConfig,
  normaliseAnswer,
  setStatusMessage,
} from '../_shared/utils.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="dialogue"]';
const STYLESHEET_ID = 'dialogue-styles';

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'dialogue';

  const surface = document.createElement('div');
  surface.className = 'dialogue__surface';
  wrapper.appendChild(surface);

  const header = document.createElement('header');
  header.className = 'dialogue__header';
  surface.appendChild(header);

  const prompt = document.createElement('h2');
  prompt.className = 'dialogue__prompt';
  prompt.textContent = config.prompt;
  header.appendChild(prompt);

  const instructions = document.createElement('p');
  instructions.className = 'dialogue__instructions';
  instructions.textContent = config.instructions;
  surface.appendChild(instructions);

  const transcript = document.createElement('div');
  transcript.className = 'dialogue__transcript';
  surface.appendChild(transcript);

  const choices = document.createElement('div');
  choices.className = 'dialogue__choices';
  surface.appendChild(choices);

  const feedback = document.createElement('p');
  feedback.className = 'dialogue__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  return {
    wrapper,
    transcript,
    choices,
    feedback,
  };
}

function addBubble(container, turn, role = 'tutor') {
  const bubble = document.createElement('div');
  bubble.className = `dialogue__bubble dialogue__bubble--${role}`;

  if (turn.avatar) {
    const avatar = document.createElement('img');
    avatar.className = 'dialogue__avatar';
    avatar.src = turn.avatar;
    avatar.alt = `${turn.speaker || role} avatar`;
    bubble.appendChild(avatar);
  }

  const content = document.createElement('div');
  content.className = 'dialogue__content';

  const speaker = document.createElement('span');
  speaker.className = 'dialogue__speaker';
  speaker.textContent = turn.speaker || (role === 'user' ? 'You' : 'Tutor');
  content.appendChild(speaker);

  const text = document.createElement('p');
  text.className = 'dialogue__text';
  text.textContent = turn.text;
  content.appendChild(text);

  bubble.appendChild(content);
  container.appendChild(bubble);
  container.scrollTop = container.scrollHeight;
}

export async function initDialogueExercise(options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Dialogue requires a browser environment.');
  }

  const {
    target = document.querySelector(DEFAULT_CONTAINER_SELECTOR),
    config: configOverride,
    onComplete,
  } = options;

  if (!target) {
    throw new Error('Dialogue target element not found.');
  }

  ensureStylesheet(STYLESHEET_ID, './styles.css', { baseUrl: import.meta.url });
  const config = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  const { wrapper, transcript, choices, feedback } = buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  let index = 0;
  let completed = false;

  function runTurn() {
    if (index >= config.turns.length) {
      completed = true;
      setStatusMessage(feedback, config.successMessage, 'success');
      if (typeof onComplete === 'function') {
        onComplete({});
      }
      return;
    }

    const turn = config.turns[index];

    if (turn.type === 'statement') {
      addBubble(transcript, turn, turn.role || 'tutor');
      index += 1;
      window.setTimeout(runTurn, turn.delay || 400);
      return;
    }

    if (turn.type === 'choice') {
      choices.innerHTML = '';
      turn.options.forEach((option) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'dialogue__choice';
        button.textContent = option.label;
        button.addEventListener('click', () => {
          if (completed) return;
          addBubble(transcript, { speaker: 'You', text: option.label }, 'user');
          const normalised = normaliseAnswer(option.value || option.label);
          const answers = (turn.answers || []).map(normaliseAnswer);
          if (answers.includes(normalised)) {
            setStatusMessage(feedback, turn.successMessage || config.turnSuccessMessage || 'Great reply!', 'success');
            index += 1;
            choices.innerHTML = '';
            window.setTimeout(runTurn, turn.delay || 500);
          } else if (option.followUp) {
            addBubble(transcript, option.followUp, option.followUp.role || 'tutor');
            setStatusMessage(feedback, turn.errorMessage || config.turnErrorMessage || 'Try a different response.', 'error');
          } else {
            setStatusMessage(feedback, turn.errorMessage || config.turnErrorMessage || 'Try a different response.', 'error');
          }
        });
        choices.appendChild(button);
      });
      return;
    }

    index += 1;
    runTurn();
  }

  setStatusMessage(feedback, config.initialMessage || '', 'neutral');
  runTurn();

  return {
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.Dialogue = initDialogueExercise;
}

export default initDialogueExercise;
