const DEFAULT_FETCH_OPTIONS = {
  credentials: 'same-origin',
  headers: {
    Accept: 'application/json',
  },
};

export function ensureStylesheet(id, relativeHref) {
  if (typeof document === 'undefined') return;
  if (!id || !relativeHref) return;

  if (document.getElementById(id)) {
    return;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';

  try {
    link.href = new URL(relativeHref, import.meta.url);
  } catch (error) {
    console.error('Unable to resolve stylesheet URL', { id, relativeHref, error });
    return;
  }

  document.head.appendChild(link);
}

export function normaliseAnswer(value) {
  return (value || '')
    .toString()
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function shuffle(array) {
  const items = Array.isArray(array) ? array.slice() : [];
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function createAudio(src) {
  if (typeof Audio === 'undefined' || !src) {
    return null;
  }

  const audio = new Audio();
  audio.src = src;
  return audio;
}

function resolveConfigUrl(path, { isCustomPath } = {}) {
  if (!path || typeof path !== 'string') {
    return null;
  }

  const trimmed = path.trim();

  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const candidateBases = [];

  if (isCustomPath) {
    if (typeof document !== 'undefined' && document.baseURI) {
      candidateBases.push(document.baseURI);
    }

    if (
      typeof window !== 'undefined' &&
      window.location &&
      typeof window.location.href === 'string'
    ) {
      candidateBases.push(window.location.href);
    }
  }

  candidateBases.push(import.meta.url);

  for (const base of candidateBases) {
    try {
      return new URL(trimmed, base).toString();
    } catch (error) {
      // Continue trying the next base candidate.
    }
  }

  return null;
}

export async function loadConfig(options = {}) {
  const { config, fallbackPath = './config.json' } = options;

  if (config && typeof config === 'object') {
    return config;
  }

  const isCustomPath = typeof config === 'string' && config.trim().length > 0;
  const path = isCustomPath ? config : fallbackPath;

  if (typeof path !== 'string' || !path.trim()) {
    throw new Error('Exercise configuration must be an object or JSON path.');
  }

  if (typeof fetch === 'undefined') {
    throw new Error('Fetching exercise configuration requires a browser environment.');
  }

  const resolvedUrl = resolveConfigUrl(path, { isCustomPath });

  if (!resolvedUrl) {
    throw new Error(`Failed to resolve configuration path: ${path}`);
  }

  const response = await fetch(resolvedUrl, DEFAULT_FETCH_OPTIONS);
  if (!response.ok) {
    throw new Error(`Failed to load configuration file: ${path}`);
  }

  return response.json();
}

export function setStatusMessage(element, message, variant = 'neutral') {
  if (!element) return;
  element.textContent = message || '';
  element.setAttribute('data-status', variant);
}

export function announce(element, message) {
  if (!element || typeof document === 'undefined') return;
  const liveRegion = document.createElement('div');
  liveRegion.setAttribute('role', 'status');
  liveRegion.setAttribute('aria-live', 'polite');
  liveRegion.className = 'sr-only';
  liveRegion.textContent = message;
  document.body.appendChild(liveRegion);
  window.setTimeout(() => {
    document.body.removeChild(liveRegion);
  }, 750);
}

export function toggleBusy(element, busy) {
  if (!element) return;
  if (busy) {
    element.setAttribute('aria-busy', 'true');
  } else {
    element.removeAttribute('aria-busy');
  }
}

export function formatBadge(text) {
  if (!text) return '';
  return String(text).toUpperCase();
}

export function createChoiceButton({ label, value, onClick, className }) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className || 'exercise__choice';
  button.textContent = label;
  if (value !== undefined) {
    button.value = value;
  }
  if (typeof onClick === 'function') {
    button.addEventListener('click', () => onClick(value, button));
  }
  return button;
}

export function createTile(text) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'exercise__tile';
  button.textContent = text;
  button.dataset.tileValue = text;
  return button;
}

export function supportsSpeechRecognition() {
  if (typeof window === 'undefined') return false;
  return (
    'SpeechRecognition' in window ||
    'webkitSpeechRecognition' in window ||
    'mozSpeechRecognition' in window ||
    'msSpeechRecognition' in window
  );
}

export function createSpeechRecognizer(options = {}) {
  if (!supportsSpeechRecognition()) {
    return null;
  }

  const Constructor =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition ||
    window.mozSpeechRecognition ||
    window.msSpeechRecognition;

  const recognizer = new Constructor();
  recognizer.lang = options.lang || 'si-LK';
  recognizer.interimResults = Boolean(options.interimResults);
  recognizer.maxAlternatives = options.maxAlternatives || 3;
  return recognizer;
}
