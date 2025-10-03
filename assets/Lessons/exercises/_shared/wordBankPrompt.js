import { getWordEntryFromUnit } from './wordBankUtils.js';
import { resolveLessonAssetPath } from './utils.js';

const FALLBACK_MASCOTS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🦉', '🐨', '🐧'];

export function renderWordBankPrompt(container, sentence, unit, options = {}) {
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
  siLine.setAttribute('lang', 'si');
  siLine.textContent = siParts.join(' ');
  bubble.appendChild(siLine);

  const translitParts = sentence.tokens.map(
    (token) => getWordEntryFromUnit(unit, token)?.translit || '',
  );
  const translitText = translitParts.join(' ').trim();
  if (!translitText) {
    bubble.classList.add('wordbank__bubble--no-translit');
  }

  mascotWrapper.appendChild(bubble);

  if (translitText) {
    const translitLine = document.createElement('div');
    translitLine.className = 'wordbank__translit';
    translitLine.setAttribute('lang', 'en');
    translitLine.textContent = translitText;
    mascotWrapper.appendChild(translitLine);
  }

  mascotWrapper.appendChild(createMascotAvatar(unit, options.lessonContext));

  promptWrapper.appendChild(mascotWrapper);
  container.appendChild(promptWrapper);
}

function createMascotAvatar(unit, lessonContext) {
  const avatar = document.createElement('div');
  avatar.className = 'wordbank__mascot-avatar';

  const candidates = resolveUnitMascotCandidates(unit, lessonContext);
  if (!candidates.length) {
    avatar.classList.add('wordbank__mascot-avatar--fallback');
    avatar.textContent = getUnitMascotEmoji(unit);
    return avatar;
  }

  const img = document.createElement('img');
  img.alt = unit?.name ? `${unit.name} mascot` : 'Mascot';

  let index = 0;
  const showFallback = () => {
    avatar.innerHTML = '';
    avatar.classList.add('wordbank__mascot-avatar--fallback');
    avatar.textContent = getUnitMascotEmoji(unit);
  };

  const tryNext = () => {
    if (index >= candidates.length) {
      showFallback();
      return;
    }
    img.src = candidates[index];
  };

  img.addEventListener('error', () => {
    index += 1;
    tryNext();
  });

  img.addEventListener('load', () => {
    avatar.classList.remove('wordbank__mascot-avatar--fallback');
    avatar.textContent = '';
  });

  avatar.appendChild(img);
  tryNext();

  return avatar;
}

function resolveUnitMascotCandidates(unit, lessonContext) {
  if (!unit) {
    return [];
  }

  const candidates = [];
  const pushCandidate = (value) => {
    if (value == null) return;
    const stringValue = String(value).trim();
    if (!stringValue) return;
    const cleaned = stringValue.replace(/^\.?\/+/, '');
    if (!cleaned) return;
    const resolved = resolveLessonAssetPath(cleaned);
    if (resolved && !candidates.includes(resolved)) {
      candidates.push(resolved);
    }
  };

  const context = lessonContext || getLessonContext();
  const meta = context?.meta || {};
  const detail = context?.detail || {};

  const resolvedUnitNumber = coercePositiveNumber(
    unit?.number,
    detail.unitNumber,
    meta.unitNumber,
    parseUnitNumberFromString(detail.unitId),
    parseUnitNumberFromString(meta.unitId),
    parseUnitNumberFromString(unit?.id),
    parseUnitNumberFromString(unit?.slug),
  );

  const resolvedSectionNumber = coercePositiveNumber(
    unit?.sectionNumber,
    detail.sectionNumber,
    meta.sectionNumber,
    parseSectionNumberFromString(detail.sectionId),
    parseSectionNumberFromString(meta.sectionId),
    parseSectionNumberFromUnitId(detail.unitId),
    parseSectionNumberFromUnitId(meta.unitId),
  );

  const sectionId = detail.sectionId || meta.sectionId || unit?.sectionId || null;
  const unitId = detail.unitId || meta.unitId || unit?.id || null;

  const directAssets = [
    unit.mascotAsset,
    unit.mascot,
    detail.mascotAsset,
    detail.mascot,
    meta.mascotAsset,
    meta.mascot,
  ];
  directAssets.forEach((asset) => pushCandidate(asset));

  const slug = typeof unit.slug === 'string' ? unit.slug : null;
  const id = typeof unit.id === 'string' ? unit.id : null;

  if (Number.isFinite(resolvedSectionNumber) && Number.isFinite(resolvedUnitNumber)) {
    const sectionValue = String(resolvedSectionNumber);
    const unitValue = String(resolvedUnitNumber);
    const paddedUnitValue = unitValue.padStart(2, '0');

    // Core general asset naming that mirrors the Learn experience cards.
    pushCandidate(`assets/general/section${sectionValue}_unit_${unitValue}.svg`);
    pushCandidate(`assets/general/section${sectionValue}_unit_${unitValue}.png`);

    // Some exported mascots omit the underscore between the unit identifier pieces.
    pushCandidate(`assets/general/section${sectionValue}unit${unitValue}.svg`);
    pushCandidate(`assets/general/section${sectionValue}unit${unitValue}.png`);

    // Zero-padded variants (e.g. unit-01) are also present for certain drops.
    pushCandidate(`assets/general/section${sectionValue}_unit_${paddedUnitValue}.svg`);
    pushCandidate(`assets/general/section${sectionValue}_unit_${paddedUnitValue}.png`);

    // Section-specific directories occasionally house the mascot assets as well.
    pushCandidate(`assets/sections/section-${sectionValue}/unit-${unitValue}.svg`);
    pushCandidate(`assets/sections/section-${sectionValue}/unit-${unitValue}.png`);
    pushCandidate(`assets/sections/section-${sectionValue}/unit-${paddedUnitValue}.svg`);
    pushCandidate(`assets/sections/section-${sectionValue}/unit-${paddedUnitValue}.png`);
  }

  if (sectionId && unitId) {
    pushCandidate(`assets/general/${sectionId}_${unitId}.svg`);
    pushCandidate(`assets/general/${sectionId}_${unitId}.png`);
  }

  if (Number.isFinite(resolvedSectionNumber)) {
    const sectionValue = String(resolvedSectionNumber);
    pushCandidate(`assets/sections/section-${sectionValue}/mascot.svg`);
    pushCandidate(`assets/general/section${sectionValue}_mascot.svg`);
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

  if (Number.isFinite(resolvedUnitNumber) && resolvedUnitNumber > 0) {
    const padded = String(resolvedUnitNumber).padStart(2, '0');
    pushCandidate(`assets/mascots/unit-${padded}.png`);
    pushCandidate(`assets/mascots/unit-${padded}.svg`);
    pushCandidate(`assets/general/unit-${padded}.png`);
    pushCandidate(`assets/general/unit-${padded}.svg`);
  }

  return candidates;
}

function resolveUnitMascotSrc(unit, lessonContext) {
  const candidates = resolveUnitMascotCandidates(unit, lessonContext);
  return candidates.length > 0 ? candidates[0] : null;
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

function getLessonContext() {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.BashaLanka?.currentLesson || null;
}

function coercePositiveNumber(...values) {
  for (const value of values) {
    const number = Number(value);
    if (!Number.isNaN(number) && number > 0) {
      return number;
    }
  }
  return null;
}

function parseUnitNumberFromString(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/unit[-_]?0*(\d+)/i);
  if (match) {
    return Number(match[1]);
  }
  const sectionMatch = String(value).match(/s\d+u(\d+)/i);
  if (sectionMatch) {
    return Number(sectionMatch[1]);
  }
  return null;
}

function parseSectionNumberFromString(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/section[-_]?0*(\d+)/i);
  if (match) {
    return Number(match[1]);
  }
  const secMatch = String(value).match(/sec(?:tion)?[-_]?0*(\d+)/i);
  if (secMatch) {
    return Number(secMatch[1]);
  }
  return null;
}

function parseSectionNumberFromUnitId(value) {
  if (!value) {
    return null;
  }
  const match = String(value).match(/s(\d+)u\d+/i);
  if (!match) {
    return null;
  }
  return Number(match[1]);
}

export { resolveUnitMascotSrc };
