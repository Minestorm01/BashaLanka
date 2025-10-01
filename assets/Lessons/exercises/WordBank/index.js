// assets/Lessons/exercises/WordBank/index.js
import {
  ensureStylesheet,
  normaliseText,
  shuffle,
  setStatusMessage,
} from '../_shared/utils.js';
import {
  fetchLessonVocab,
  fetchAllLessonVocabsUpTo,
  loadLessonSource,
} from '../TranslateToBase/index.js';

const DEFAULT_CONTAINER_SELECTOR = '[data-exercise="word-bank"]';
const STYLESHEET_ID = 'word-bank-styles';

// 🛠 Build config from lesson wordbank prompts
export async function buildWordBankConfig() {
  const context = window.BashaLanka?.currentLesson || {};
  const detail = context.detail || {};
  if (!detail.lessonPath) {
    throw new Error('Lesson path not found for WordBank exercise.');
  }

  // Load the lesson file
  const lesson = await loadLessonSource(detail.lessonPath);

  if (!Array.isArray(lesson.wordBankPrompts) || !lesson.wordBankPrompts.length) {
    throw new Error(`Lesson ${detail.lessonPath} missing wordBankPrompts.`);
  }

  // Grab current lesson number
  const lessonNumberMatch = detail.lessonPath.match(/lesson-(\d+)\.md$/i);
  const lessonNumber = lessonNumberMatch ? parseInt(lessonNumberMatch[1], 10) : 1;

  // Collect vocab from current + earlier lessons for distractors
  const allVocabs = await fetchAllLessonVocabsUpTo(lessonNumber);
  const allSinhalaWords = Array.from(
    new Set(allVocabs.map((v) => normaliseText(v.si) || v.si).filter(Boolean))
  );

  // Select first wordbank prompt in this lesson (extendable later)
  const selectedPrompt = lesson.wordBankPrompts[0];
  const correctAnswers = (selectedPrompt.answers || []).map((a) =>
    normaliseText(a)
  );

  // Sentence words = split first answer into tokens
  const sentenceWords = correctAnswers[0].split(/\s+/);

  // Word bank = sentence words + distractors
  const distractors = shuffle(
    allSinhalaWords.filter((w) => !sentenceWords.includes(w))
  ).slice(0, 5); // add up to 5 extras
  const bankWords = shuffle([...sentenceWords, ...distractors]);

  return {
    prompt: selectedPrompt.prompt || 'Form the sentence',
    correctAnswers,
    bankWords,
  };
}

function buildLayout(config) {
  const wrapper = document.createElement('section');
  wrapper.className = 'word-bank';

  const surface = document.createElement('div');
  surface.className = 'word-bank__surface';
  wrapper.appendChild(surface);

  // Header (mascot + bubble like TranslateToBase)
  const header = document.createElement('div');
  header.className = 'word-bank__header';
  surface.appendChild(header);

  const lessonContext = window.BashaLanka?.currentLesson || {};
  const lessonDetail = lessonContext.detail || {};
  const lessonMeta = lessonContext.meta || {};
  let mascotSrc = lessonDetail.mascot;
  if (!mascotSrc && lessonMeta.sectionNumber) {
    mascotSrc = `assets/sections/section-${lessonMeta.sectionNumber}/mascot.svg`;
  }
  if (!mascotSrc) {
    mascotSrc = 'assets/sections/section-1/mascot.svg';
  }

  const mascot = document.createElement('img');
  mascot.className = 'word-bank__mascot';
  mascot.src = mascotSrc;
  mascot.alt = 'Lesson mascot';
  header.appendChild(mascot);

  const bubble = document.createElement('div');
  bubble.className = 'word-bank__bubble';
  header.appendChild(bubble);

  const assembled = document.createElement('div');
  assembled.className = 'word-bank__assembled';
  bubble.appendChild(assembled);

  // Word bank grid
  const grid = document.createElement('div');
  grid.className = 'word-bank__grid';
  surface.appendChild(grid);

  // Controls
  const controls = document.createElement('div');
  controls.className = 'word-bank__controls';
  surface.appendChild(controls);

  const checkBtn = document.createElement('button');
  checkBtn.type = 'button';
  checkBtn.className = 'word-bank__check';
  checkBtn.textContent = 'Check';
  controls.appendChild(checkBtn);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'word-bank__reset';
  resetBtn.textContent = 'Reset';
  controls.appendChild(resetBtn);

  // Feedback
  const feedback = document.createElement('p');
  feedback.className = 'word-bank__feedback';
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  surface.appendChild(feedback);

  return {
    wrapper,
    assembled,
    grid,
    checkBtn,
    resetBtn,
    feedback,
  };
}

function createTile(word) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'word-bank__tile';
  button.textContent = word;
  return button;
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

  const rawConfig = configOverride || (await buildWordBankConfig());
  const config = rawConfig;
  const { wrapper, assembled, grid, checkBtn, resetBtn, feedback } =
    buildLayout(config);
  target.innerHTML = '';
  target.appendChild(wrapper);

  const assembledWords = [];

  const refreshAssembled = () => {
    assembled.innerHTML = '';
    assembledWords.forEach((w, idx) => {
      const tile = createTile(w);
      tile.classList.add('word-bank__tile--assembled');
      tile.addEventListener('click', () => {
        assembledWords.splice(idx, 1);
        refreshAssembled();
        renderBank();
      });
      assembled.appendChild(tile);
    });
  };

  const renderBank = () => {
    grid.innerHTML = '';
    config.bankWords.forEach((w) => {
      if (!assembledWords.includes(w)) {
        const tile = createTile(w);
        tile.addEventListener('click', () => {
          assembledWords.push(w);
          refreshAssembled();
          renderBank();
        });
        grid.appendChild(tile);
      }
    });
  };

  checkBtn.addEventListener('click', () => {
    const userAnswer = normaliseText(assembledWords.join(' '));
    const isCorrect = config.correctAnswers.some(
      (ans) => normaliseText(ans) === userAnswer
    );
    if (isCorrect) {
      setStatusMessage(feedback, 'Correct!', 'success');
      checkBtn.disabled = true;
      resetBtn.disabled = true;
      if (typeof onComplete === 'function') {
        onComplete({ answer: userAnswer });
      }
    } else {
      setStatusMessage(feedback, 'Not quite. Try again.', 'error');
    }
  });

  resetBtn.addEventListener('click', () => {
    assembledWords.length = 0;
    refreshAssembled();
    renderBank();
    setStatusMessage(feedback, '', 'neutral');
    checkBtn.disabled = false;
    resetBtn.disabled = false;
  });

  refreshAssembled();
  renderBank();
  setStatusMessage(feedback, 'Form the sentence to continue.', 'neutral');

  return {
    config,
  };
}

if (typeof window !== 'undefined') {
  window.BashaLanka = window.BashaLanka || {};
  window.BashaLanka.exercises = window.BashaLanka.exercises || {};
  window.BashaLanka.exercises.WordBank = initWordBankExercise;
}

export default initWordBankExercise;
