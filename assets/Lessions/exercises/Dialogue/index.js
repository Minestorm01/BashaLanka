import {
  ensureStylesheet,
  loadConfig,
  normaliseAnswer,
  normaliseText,
  createAnswerLookup,
  addAnswerToLookup,
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

function prepareConfig(rawConfig) {
  if (!rawConfig || typeof rawConfig !== 'object') {
    throw new Error('Dialogue config must be an object.');
  }

  const prompt = normaliseText(rawConfig.prompt);
  if (!prompt) {
    throw new Error('Dialogue config requires a prompt.');
  }

  const instructions = normaliseText(rawConfig.instructions) || 'Follow the conversation and respond.';
  const turnSuccessMessage = normaliseText(rawConfig.turnSuccessMessage) || 'Great reply!';
  const turnErrorMessage = normaliseText(rawConfig.turnErrorMessage) || 'Try a different response.';
  const successMessage = normaliseText(rawConfig.successMessage) || 'Dialogue complete!';
  const initialMessage = normaliseText(rawConfig.initialMessage);

  const turns = Array.isArray(rawConfig.turns) ? rawConfig.turns : [];
  const preparedTurns = turns
    .map((turn) => {
      if (!turn || typeof turn !== 'object') {
        return null;
      }

      const type = normaliseText(turn.type).toLowerCase();
      if (type === 'statement') {
        const text = normaliseText(turn.text);
        if (!text) return null;
        return {
          ...turn,
          type: 'statement',
          text,
          speaker: normaliseText(turn.speaker) || undefined,
          role: normaliseText(turn.role) || 'tutor',
          delay: Number.isFinite(turn.delay) ? turn.delay : 400,
        };
      }

      if (type === 'choice') {
        const options = Array.isArray(turn.options)
          ? turn.options
              .map((option) => {
                if (!option || typeof option !== 'object') return null;
                const label = normaliseText(option.label);
                const value = normaliseText(option.value || option.label);
                if (!label) return null;
                const followUp = option.followUp && typeof option.followUp === 'object'
                  ? {
                      ...option.followUp,
                      text: normaliseText(option.followUp.text),
                      speaker: normaliseText(option.followUp.speaker) || undefined,
                      role: normaliseText(option.followUp.role) || 'tutor',
                    }
                  : undefined;
                return {
                  ...option,
                  label,
                  value,
                  followUp,
                };
              })
              .filter(Boolean)
          : [];

        if (!options.length) return null;

        const answersLookup = createAnswerLookup(turn.answers);
        options.forEach((option) => {
          if (option.isCorrect || option.correct) {
            addAnswerToLookup(answersLookup, option.value || option.label);
          }
        });

        const answers = Array.from(answersLookup.values());
        if (!answers.length) {
          throw new Error('Dialogue choice turns require at least one correct answer.');
        }

        return {
          ...turn,
          type: 'choice',
          options,
          answers,
          successMessage: normaliseText(turn.successMessage) || undefined,
          errorMessage: normaliseText(turn.errorMessage) || undefined,
          delay: Number.isFinite(turn.delay) ? turn.delay : 500,
        };
      }

      return null;
    })
    .filter(Boolean);

  if (!preparedTurns.length) {
    throw new Error('Dialogue config requires at least one turn.');
  }

  return {
    ...rawConfig,
    prompt,
    instructions,
    turns: preparedTurns,
    turnSuccessMessage,
    turnErrorMessage,
    successMessage,
    initialMessage,
  };
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
  const rawConfig = await loadConfig({ config: configOverride, baseUrl: import.meta.url });
  const config = prepareConfig(rawConfig);
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
