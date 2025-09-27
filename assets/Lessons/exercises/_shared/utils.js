const DEFAULT_FETCH_OPTIONS = {
  credentials: 'same-origin',
  headers: {
    Accept: 'application/json',
  },
};

const ABSOLUTE_URL_PATTERN = /^[a-z][a-z0-9+.-]*:/i;
const PROTOCOL_RELATIVE_PATTERN = /^\/\//;

function normaliseRepoNameSegment(repoName) {
  if (!repoName) {
    return '';
  }

  return String(repoName)
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
}

export function resolveRepoBasePath(options = {}) {
  const { repoName = 'BashaLanka' } = options;

  if (typeof window === 'undefined' || !window.location) {
    return './';
  }

  const { hostname = '', protocol = '' } = window.location;
  const lowerHost = hostname.toLowerCase();

  if (lowerHost.includes('github.io')) {
    const segment = normaliseRepoNameSegment(repoName);
    return segment ? `/${segment}/` : '/';
  }

  if (
    protocol === 'file:' ||
    lowerHost === 'localhost' ||
    lowerHost === '127.0.0.1' ||
    lowerHost === '::1' ||
    lowerHost === '[::1]'
  ) {
    return './';
  }

  return '/';
}

export function resolveLessonAssetPath(path, options = {}) {
  const { repoName = 'BashaLanka' } = options;

  if (typeof path !== 'string') {
    return path;
  }

  const trimmed = path.trim();

  if (!trimmed) {
    return trimmed;
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed) || PROTOCOL_RELATIVE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const cleaned = trimmed.replace(/^\.?\/+/, '');
  const repoBasePath = resolveRepoBasePath({ repoName });

  if (repoBasePath === './') {
    return `./${cleaned}`;
  }

  const baseWithSlash = repoBasePath.endsWith('/') ? repoBasePath : `${repoBasePath}/`;
  return `${baseWithSlash}${cleaned}`;
}

export function normaliseText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  return value
    .toString()
    .trim()
    .replace(/\s+/g, ' ');
}

function resolveStylesheetHref(href, baseUrl) {
  if (!href) {
    return null;
  }

  if (href instanceof URL) {
    return href.toString();
  }

  if (typeof href !== 'string') {
    return null;
  }

  const trimmed = href.trim();

  if (!trimmed) {
    return null;
  }

  if (ABSOLUTE_URL_PATTERN.test(trimmed) || PROTOCOL_RELATIVE_PATTERN.test(trimmed)) {
    return trimmed;
  }

  const candidates = [];

  if (baseUrl) {
    candidates.push(baseUrl);
  }

  if (typeof document !== 'undefined' && document.baseURI) {
    candidates.push(document.baseURI);
  }

  candidates.push(import.meta.url);

  for (const base of candidates) {
    try {
      return new URL(trimmed, base).toString();
    } catch (error) {
      // Continue to the next candidate.
    }
  }

  return null;
}

export function ensureStylesheet(id, relativeHref, options = {}) {
  if (typeof document === 'undefined') return;
  if (!id || !relativeHref) return;

  if (document.getElementById(id)) {
    return;
  }

  const baseUrl =
    typeof options === 'string'
      ? options
      : options && typeof options === 'object'
      ? options.baseUrl
      : null;

  const resolvedHref = resolveStylesheetHref(relativeHref, baseUrl);

  if (!resolvedHref) {
    console.error('Unable to resolve stylesheet URL', { id, relativeHref, baseUrl });
    return;
  }

  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = resolvedHref;

  document.head.appendChild(link);
}

export function normaliseAnswer(value) {
  return normaliseText(value).toLowerCase();
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

function resolveConfigUrl(path, { isCustomPath, baseUrl } = {}) {
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

  if (baseUrl) {
    candidateBases.push(baseUrl);
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
  const { config, fallbackPath = './config.json', baseUrl = null } = options;

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

  const resolvedUrl = resolveConfigUrl(path, { isCustomPath, baseUrl });

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

export function createAnswerLookup(initialAnswers = []) {
  const lookup = new Map();
  if (Array.isArray(initialAnswers)) {
    initialAnswers.forEach((value) => {
      addAnswerToLookup(lookup, value);
    });
  }
  return lookup;
}

export function addAnswerToLookup(lookup, value) {
  if (!(lookup instanceof Map)) return;
  const text = normaliseText(value);
  if (!text) return;
  const key = normaliseAnswer(text);
  if (!key || lookup.has(key)) return;
  lookup.set(key, text);
}

export function answerLookupHas(lookup, value) {
  if (!(lookup instanceof Map)) return false;
  const key = normaliseAnswer(normaliseText(value));
  return lookup.has(key);
}

export function normaliseChoiceItem(choice, options = {}) {
  const {
    labelKey = 'label',
    valueKey = 'value',
    fallbackLabelKeys = [],
    fallbackValueKeys = [],
    allowString = true,
  } = options;

  if (choice === null || choice === undefined) {
    return null;
  }

  if (allowString && (typeof choice === 'string' || typeof choice === 'number')) {
    const label = normaliseText(choice);
    if (!label) return null;
    return {
      label,
      value: label,
      isCorrect: false,
    };
  }

  if (typeof choice !== 'object') {
    return null;
  }

  const next = { ...choice };

  const labelCandidates = [next[labelKey], next[valueKey], ...fallbackLabelKeys.map((key) => next[key])];
  let label = '';
  for (const candidate of labelCandidates) {
    const clean = normaliseText(candidate);
    if (clean) {
      label = clean;
      break;
    }
  }

  if (!label) {
    return null;
  }

  const valueCandidates = [next[valueKey], next[labelKey], ...fallbackValueKeys.map((key) => next[key])];
  let value = '';
  for (const candidate of valueCandidates) {
    const clean = normaliseText(candidate);
    if (clean) {
      value = clean;
      break;
    }
  }

  if (!value) {
    value = label;
  }

  let { isCorrect } = next;
  if (isCorrect === undefined && next.correct !== undefined) {
    isCorrect = Boolean(next.correct);
  }

  return {
    ...next,
    label,
    value,
    isCorrect: Boolean(isCorrect),
  };
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
