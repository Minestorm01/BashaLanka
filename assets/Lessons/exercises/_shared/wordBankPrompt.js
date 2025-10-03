import { getWordEntryFromUnit } from './wordBankUtils.js';
import { resolveLessonAssetPath } from './utils.js';

const FALLBACK_MASCOTS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🦉', '🐨', '🐧'];

export function renderWordBankPrompt(container, sentence, unit) {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  if (!sentence) {
    return;
  }

  const promptWrapper = document.createElement('div');
  promptWrapper.className = 'wordbank__prompt-content';

  const mascotWrapper = document.createElement('div');
  mascotWrapper.className = 'wordbank__mascot';

  const bubble = document.createElement('div');
  bubble.className = 'wordbank__bubble';

  const siParts = sentence.tokens.map((token) => getWordEntryFromUnit(unit, token)?.si || token);
  const siLine = document.createElement('div');
  siLine.className = 'wordbank__si';
  siLine.textContent = siParts.join(' ');
  bubble.appendChild(siLine);

  const translitParts = sentence.tokens.map(
    (token) => getWordEntryFromUnit(unit, token)?.translit || '',
  );
  const translitText = translitParts.join(' ').trim();
  if (translitText) {
    const translitLine = document.createElement('div');
    translitLine.className = 'wordbank__translit';
    translitLine.textContent = translitText;
    bubble.appendChild(translitLine);
  } else {
    bubble.classList.add('wordbank__bubble--no-translit');
  }

  mascotWrapper.appendChild(bubble);
  mascotWrapper.appendChild(createMascotAvatar(unit));

  promptWrapper.appendChild(mascotWrapper);
  container.appendChild(promptWrapper);
}

function createMascotAvatar(unit) {
  const avatar = document.createElement('div');
  avatar.className = 'wordbank__mascot-avatar';

  const src = resolveUnitMascotSrc(unit);
  if (src) {
    const img = document.createElement('img');
    img.alt = unit?.name ? `${unit.name} mascot` : 'Mascot';
    img.src = src;
    img.addEventListener('error', () => {
      avatar.innerHTML = '';
      avatar.classList.add('wordbank__mascot-avatar--fallback');
      avatar.textContent = getUnitMascotEmoji(unit);
    });
    avatar.appendChild(img);
  } else {
    avatar.classList.add('wordbank__mascot-avatar--fallback');
    avatar.textContent = getUnitMascotEmoji(unit);
  }

  return avatar;
}

function resolveUnitMascotSrc(unit) {
  if (!unit) {
    return null;
  }

  const candidates = [];
  const pushCandidate = (value) => {
    if (value == null) return;
    const stringValue = String(value).trim();
    if (!stringValue) return;
    const cleaned = stringValue.replace(/^\.?\/+/, '');
    if (!cleaned) return;
    if (!candidates.includes(cleaned)) {
      candidates.push(cleaned);
    }
  };

  const slug = typeof unit.slug === 'string' ? unit.slug : null;
  const id = typeof unit.id === 'string' ? unit.id : null;
  const numericId = typeof unit.number === 'number' && Number.isFinite(unit.number)
    ? unit.number
    : Number(unit.id);

  if (typeof unit.mascotAsset === 'string') {
    pushCandidate(unit.mascotAsset);
  }

  if (typeof unit.mascot === 'string') {
    pushCandidate(`assets/mascots/${unit.mascot}`);
  }

  if (slug) {
    pushCandidate(`assets/mascots/${slug}.png`);
    pushCandidate(`assets/mascots/${slug}.svg`);
    pushCandidate(`assets/general/${slug}.png`);
    pushCandidate(`assets/general/${slug}.svg`);
  }

  if (id && id !== slug) {
    pushCandidate(`assets/mascots/${id}.png`);
    pushCandidate(`assets/mascots/${id}.svg`);
    pushCandidate(`assets/general/${id}.png`);
    pushCandidate(`assets/general/${id}.svg`);
  }

  if (!Number.isNaN(numericId) && numericId > 0) {
    const padded = String(numericId).padStart(2, '0');
    pushCandidate(`assets/mascots/unit-${padded}.png`);
    pushCandidate(`assets/mascots/unit-${padded}.svg`);
    pushCandidate(`assets/general/unit-${padded}.png`);
    pushCandidate(`assets/general/unit-${padded}.svg`);
    pushCandidate(`assets/general/section1_unit_${numericId}.svg`);
  }

  for (const candidate of candidates) {
    const resolved = resolveLessonAssetPath(candidate);
    if (resolved) {
      return resolved;
    }
  }

  return null;
}

function getUnitMascotEmoji(unit) {
  if (unit && typeof unit.mascotEmoji === 'string' && unit.mascotEmoji.trim()) {
    return unit.mascotEmoji.trim();
  }

  const indexBase = Number.isFinite(unit?.number) ? Number(unit.number) - 1 : Number(unit?.id) - 1;
  if (Number.isFinite(indexBase) && indexBase >= 0) {
    return FALLBACK_MASCOTS[indexBase % FALLBACK_MASCOTS.length];
  }

  return FALLBACK_MASCOTS[0];
}

export { resolveUnitMascotSrc };
