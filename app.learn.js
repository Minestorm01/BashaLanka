(function(){
  const container = document.getElementById('view-learn');
  if(!container) return;

  const SECTION_ROOT = 'assets/sections';
  const OVERVIEW_TRANSITION_MS = 320;
  const overviewData = readOverviewData();
  const overviewState = {
    activePanel: null,
    activeTrigger: null
  };
  const lessonPopoverState = {
    activePopover: null,
    activeTrigger: null
  };
  let sections = [];
  let loadingPromise = null;
  let sectionsLoadedEventSent = false;
  const courseHierarchyState = {
    promise: null,
    ready: false,
    sections: [],
    unitMap: new Map()
  };
  const lessonDataCache = new Map();
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const PAW_SYMBOL_DIMENSIONS = { width: 72.94, height: 31.31 };
  const lessonTrailState = {
    pair: null,
    resizeHandler: null,
    rafId: null,
    timeoutId: null
  };
  let pawSymbolPromise = null;

  function normalizeLessonTitle(title = ''){
    return title
      .toString()
      .normalize('NFKD')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9+]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function findLessonButtonByTitle(root, title){
    if(!root || !title) return null;
    const target = normalizeLessonTitle(title);
    if(!target) return null;
    const rows = root.querySelectorAll('.lesson-row.lesson-row--lesson');
    for(const row of rows){
      const heading = row.querySelector('.lesson-popover__title');
      const button = row.querySelector('button.lesson');
      if(!heading || !button) continue;
      const normalizedHeading = normalizeLessonTitle(heading.textContent);
      if(!normalizedHeading) continue;
      if(normalizedHeading === target || normalizedHeading.includes(target) || target.includes(normalizedHeading)){
        return button;
      }
    }
    return null;
  }

  function ensureLessonPathsOverlay(root){
    if(!root) return null;
    let overlay = root.querySelector('#lesson-paths');
    if(!overlay){
      overlay = document.createElementNS(SVG_NS, 'svg');
      overlay.id = 'lesson-paths';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.setAttribute('focusable', 'false');
      overlay.setAttribute('preserveAspectRatio', 'none');
      root.appendChild(overlay);
    }
    overlay.innerHTML = '';
    return overlay;
  }

  function ensurePawSymbol(){
    const existing = document.getElementById('lesson-path-symbols');
    if(existing && existing.querySelector('#paw')){
      return Promise.resolve(existing.querySelector('#paw'));
    }
    if(pawSymbolPromise) return pawSymbolPromise;
    pawSymbolPromise = fetch('assets/general/path.svg')
      .then(res => {
        if(!res.ok) throw new Error(`Failed to load paw asset: ${res.status}`);
        return res.text();
      })
      .then(svgText => {
        const parser = new DOMParser();
        const doc = parser.parseFromString(svgText, 'image/svg+xml');
        const source = doc.documentElement;
        if(!source) return null;
        const symbol = document.createElementNS(SVG_NS, 'symbol');
        symbol.id = 'paw';
        const viewBox = source.getAttribute('viewBox');
        if(viewBox) symbol.setAttribute('viewBox', viewBox);
        Array.from(source.childNodes).forEach(node => {
          symbol.appendChild(node.cloneNode(true));
        });
        const defs = document.createElementNS(SVG_NS, 'svg');
        defs.id = 'lesson-path-symbols';
        defs.setAttribute('aria-hidden', 'true');
        defs.setAttribute('focusable', 'false');
        defs.style.position = 'absolute';
        defs.style.width = '0';
        defs.style.height = '0';
        defs.style.pointerEvents = 'none';
        defs.style.overflow = 'hidden';
        defs.appendChild(symbol);
        document.body.appendChild(defs);
        return symbol;
      })
      .catch(err => {
        console.error('Unable to prepare paw symbol', err);
        return null;
      });
    return pawSymbolPromise;
  }

  function scheduleLessonTrailRender(){
    if(lessonTrailState.rafId){
      cancelAnimationFrame(lessonTrailState.rafId);
    }
    lessonTrailState.rafId = requestAnimationFrame(() => {
      lessonTrailState.rafId = null;
      renderLessonConnection();
    });
  }

  function renderLessonConnection(){
    if(!lessonTrailState.pair) return;
    const root = container.querySelector('.section-page');
    if(!root) return;
    const overlay = ensureLessonPathsOverlay(root);
    if(!overlay) return;

    const [startTitle, endTitle] = lessonTrailState.pair;
    const startButton = findLessonButtonByTitle(root, startTitle);
    const endButton = findLessonButtonByTitle(root, endTitle);
    if(!startButton || !endButton){
      overlay.innerHTML = '';
      return;
    }

    const rootRect = root.getBoundingClientRect();
    const width = rootRect.width || root.clientWidth || 0;
    const height = Math.max(rootRect.height || 0, root.scrollHeight || 0);
    if(width <= 0 || height <= 0){
      return;
    }
    overlay.setAttribute('viewBox', `0 0 ${width} ${height}`);
    overlay.setAttribute('width', width);
    overlay.setAttribute('height', height);

    const toLocalPoint = button => {
      const rect = button.getBoundingClientRect();
      return {
        x: rect.left + rect.width / 2 - rootRect.left,
        y: rect.top + rect.height / 2 - rootRect.top
      };
    };

    const startPoint = toLocalPoint(startButton);
    const endPoint = toLocalPoint(endButton);
    const dx = endPoint.x - startPoint.x;
    const dy = endPoint.y - startPoint.y;
    const distance = Math.hypot(dx, dy) || 1;
    const normal = { x: dx / distance, y: dy / distance };
    const perpendicular = { x: -normal.y, y: normal.x };
    const curveStrength = Math.min(120, distance * 0.35);
    const curvature = startPoint.x <= endPoint.x ? 1 : -1;

    const control1 = {
      x: startPoint.x + dx * 0.25 + perpendicular.x * curveStrength * curvature,
      y: startPoint.y + dy * 0.25 + perpendicular.y * curveStrength * curvature
    };
    const control2 = {
      x: startPoint.x + dx * 0.75 - perpendicular.x * curveStrength * curvature,
      y: startPoint.y + dy * 0.75 - perpendicular.y * curveStrength * curvature
    };

    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', `M ${startPoint.x} ${startPoint.y} C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${endPoint.x} ${endPoint.y}`);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', 'none');
    overlay.appendChild(path);

    const totalLength = path.getTotalLength();
    if(!Number.isFinite(totalLength) || totalLength <= 0){
      return;
    }

    const pawSize = 28;
    const pawScale = pawSize / PAW_SYMBOL_DIMENSIONS.width;
    const spacing = 60;
    const printsGroup = document.createElementNS(SVG_NS, 'g');
    let index = 0;

    for(let dist = spacing * 0.5; dist < totalLength - spacing * 0.25; dist += spacing){
      const point = path.getPointAtLength(dist);
      const ahead = path.getPointAtLength(Math.min(dist + 0.1, totalLength));
      let tangent = { x: ahead.x - point.x, y: ahead.y - point.y };
      const tangentLength = Math.hypot(tangent.x, tangent.y) || 1;
      tangent = { x: tangent.x / tangentLength, y: tangent.y / tangentLength };
      const offsetDir = index % 2 === 0 ? 1 : -1;
      const offsetAmount = 10 * offsetDir;
      const offsetPoint = {
        x: point.x + (-tangent.y) * offsetAmount,
        y: point.y + tangent.x * offsetAmount
      };
      const angle = Math.atan2(tangent.y, tangent.x) * (180 / Math.PI);
      const use = document.createElementNS(SVG_NS, 'use');
      use.setAttribute('href', '#paw');
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#paw');
      use.setAttribute('transform', `translate(${offsetPoint.x}, ${offsetPoint.y}) rotate(${angle}) scale(${pawScale}) translate(${-PAW_SYMBOL_DIMENSIONS.width / 2}, ${-PAW_SYMBOL_DIMENSIONS.height / 2})`);
      use.setAttribute('opacity', '0.95');
      printsGroup.appendChild(use);
      index += 1;
    }

    overlay.appendChild(printsGroup);
  }

  function connectLessons(startTitle, endTitle){
    lessonTrailState.pair = [startTitle, endTitle];
    ensurePawSymbol().finally(() => {
      scheduleLessonTrailRender();
      if(lessonTrailState.timeoutId){
        clearTimeout(lessonTrailState.timeoutId);
      }
      lessonTrailState.timeoutId = setTimeout(() => {
        lessonTrailState.timeoutId = null;
        scheduleLessonTrailRender();
      }, 250);
    });

    if(lessonTrailState.resizeHandler){
      window.removeEventListener('resize', lessonTrailState.resizeHandler);
    }
    lessonTrailState.resizeHandler = () => {
      scheduleLessonTrailRender();
    };
    window.addEventListener('resize', lessonTrailState.resizeHandler, { passive: true });
  }

  function trophySrc(progress){
    const file = progress >= 1 ? 'trophy-gold_1.svg' : 'trophy-silver_1.svg';
    return `assets/general/${file}`;
  }

  function speechBubble(phrase = {}){
    const romanised = phrase.romanised || '';
    const si = phrase.si || '';
    if(!romanised && !si) return '';
    return `
      <div class="speech-bubble" role="note" aria-label="Section phrase">
        ${romanised ? `<p class="speech-line romanised">${romanised}</p>` : ''}
        ${si ? `<p class="speech-line sinhala">${si}</p>` : ''}
      </div>`;
  }

  function normalizeLessonEntry(lesson, fallbackStatus, index, meta = {}){
    const order = typeof meta.order === 'number'
      ? meta.order
      : (typeof index === 'number' ? index + 1 : 0);
    const lessonIndex = typeof meta.lessonIndex === 'number'
      ? meta.lessonIndex
      : (typeof index === 'number' ? index + 1 : 0);
    const skillId = meta.skillId || '';
    const levelId = meta.levelId || '';
    const baseType = meta.type || null;

    if(typeof lesson === 'string'){
      const typeValue = baseType;
      return {
        id: lesson,
        title: typeof index === 'number' ? `Lesson ${index + 1}` : 'Lesson',
        status: fallbackStatus,
        type: typeValue,
        isReview: typeValue === 'review',
        skillId,
        levelId,
        order,
        lessonIndex
      };
    }

    if(lesson && typeof lesson === 'object'){
      const typeValue = lesson.type || baseType || null;
      return {
        id: lesson.id || lesson.lessonId || '',
        title: lesson.title || (typeof index === 'number' ? `Lesson ${index + 1}` : 'Untitled lesson'),
        status: lesson.status || fallbackStatus,
        type: typeValue,
        isReview: typeValue === 'review',
        skillId: lesson.skillId || skillId,
        levelId: lesson.levelId || levelId,
        order,
        lessonIndex
      };
    }

    const typeValue = baseType;
    return {
      id: '',
      title: typeof index === 'number' ? `Lesson ${index + 1}` : 'Untitled lesson',
      status: fallbackStatus,
      type: typeValue,
      isReview: typeValue === 'review',
      skillId,
      levelId,
      order,
      lessonIndex
    };
  }

  function buildUnitLessons(unit){
    const fallbackStatus = unit.status || 'locked';
    const directLessons = Array.isArray(unit.lessons) ? unit.lessons : [];
    if(directLessons.length){
      return directLessons.map((lesson, index) => normalizeLessonEntry(lesson, fallbackStatus, index, {
        order: index + 1,
        lessonIndex: index + 1
      }));
    }

    const skills = Array.isArray(unit.skills) ? unit.skills : [];
    if(!skills.length) return [];

    const flattened = [];
    let globalOrder = 0;
    skills.forEach(skill => {
      const skillId = skill.skillId || skill.id || '';
      const levels = Array.isArray(skill.levels) ? skill.levels : [];
      levels.forEach(level => {
        const levelId = level.levelId || level.id || '';
        const refs = Array.isArray(level.lessons) ? level.lessons : [];
        refs.forEach((ref, index) => {
          globalOrder += 1;
          const typeValue = ref && typeof ref === 'object' ? ref.type : null;
          flattened.push(normalizeLessonEntry(ref, fallbackStatus, index, {
            skillId,
            levelId,
            order: globalOrder,
            lessonIndex: index + 1,
            type: typeValue
          }));
        });
      });
    });

    return flattened;
  }

  function lessonStats(lessons){
    const total = lessons.length;
    const completed = lessons.filter(l => l.status === 'completed').length;
    const unlocked = lessons.filter(l => l.status === 'completed' || l.status === 'unlocked').length;
    return { total, completed, unlocked };
  }

  function normalizeUnit(unit, index){
    const lessons = buildUnitLessons(unit);
    const { total, completed, unlocked } = lessonStats(lessons);
    const progress = total ? completed / total : 0;
    let status = unit.status || 'locked';
        if(status !== 'locked' && completed >= total && total > 0){
      status = 'completed';
    }else if(status === 'locked' && unlocked > 0){
      status = 'unlocked';
    }
    const number = unit.number
      || parseInt(((unit.id || '').match(/(\d+)/) || [])[1] || '', 10)
      || (typeof index === 'number' ? index + 1 : 1);
    return {
      ...unit,
      status,
      lessons,
      lessonsTotal: total,
      lessonsCompleted: completed,
      lessonsUnlocked: unlocked,
      progress,
      number
    };
  }

  function normalizeSection(section){
    const slug = section.id || `section-${section.number || ''}`;
    const number = section.number || parseInt((slug.match(/(\d+)/) || [])[1] || sections.length + 1, 10);
    const mascot = section.mascot || `${SECTION_ROOT}/${slug}/mascot.svg`;
    const units = (section.units || []).map((unit, index) => normalizeUnit(unit, index));
    const lessonsTotal = units.reduce((sum, unit) => sum + unit.lessonsTotal, 0);
    const lessonsDone = units.reduce((sum, unit) => sum + unit.lessonsCompleted, 0);
    const progress = lessonsTotal ? lessonsDone / lessonsTotal : 0;
    const status = section.status || (progress >= 1 ? 'completed' : units.some(u => u.status !== 'locked') ? 'unlocked' : 'locked');
    const cta = section.cta || (status === 'locked'
      ? 'Locked'
      : (progress > 0 ? 'Continue' : `Start Section ${number}`));
    return {
      ...section,
      id: slug,
      number,
      mascot,
      units,
      lessonsTotal,
      lessonsDone,
      progress,
      status,
      cta
    };
  }

  async function loadSections(){
        const found = [];
    for(let index = 1; index <= 50; index += 1){
      const slug = `section-${index}`;
      const path = `${SECTION_ROOT}/${slug}/units.json`;
      try{
        const res = await fetch(path);
        if(!res.ok){
          if(index === 1) console.warn(`No section data found at ${path}`);
          break;
 }
        const data = await res.json();
        found.push(normalizeSection(data));
      }catch(err){
        console.error('Failed to load section data', slug, err);
        break;
       }
    }
    return found.sort((a, b) => a.number - b.number);
  }

  async function ensureSections(){
    if(sections.length) return sections;
    if(loadingPromise) return loadingPromise;
    loadingPromise = loadSections().then(result => {
      sections = result;
      if(!sectionsLoadedEventSent){
        sectionsLoadedEventSent = true;
        window.dispatchEvent(new CustomEvent('learn:sections-loaded', {
          detail: { sections: sections.map(sec => ({ ...sec })) }
        }));
      }
      return sections;
    });
    return loadingPromise;
  }

  function renderLearn(){
    const cards = sections.map(sec => sectionCard(sec)).join('');
    const listMarkup = cards || '<p class="unit-path__empty">No sections available yet.</p>';
    container.innerHTML = `<div class="learn-wrap"><div class="sections-list">${listMarkup}</div><aside class="learn-rail hide-mobile"><h3>Coming soon</h3></aside></div>`;
    resetLessonPopoverState();
    setupSectionOverviews();
  }

  function sectionCard(sec){
    const pct = Math.round(sec.progress * 100);
    const locked = sec.status === 'locked';
    const trophy = trophySrc(sec.progress);
    const note = locked ? '<small class="locked-note">Finish previous to unlock</small>' : '';
    const completed = sec.status === 'completed' || sec.progress >= 1;
    const btnLabel = locked ? 'Locked' : completed ? 'Completed!' : sec.cta;
    const sectionId = String(sec.number);
    const subtitle = getSectionSubtitle(sectionId, sec);
    const titleId = `section-${sectionId}-title`;
    const detailsHref = `/sections/${sectionId}`;
    return `<article class="section-card" data-section-id="${sectionId}"><div class="section-card__left">
      <div class="section-card__header">
        <h2 class="section-title" id="${titleId}">${sec.title}</h2>
        ${subtitle ? `<p class="section-subtitle">${subtitle}</p>` : ''}
      </div>
      <div class="progress-row">
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${sec.lessonsTotal}" aria-valuenow="${sec.lessonsDone}">
          <div class="progress__fill" style="width:${pct}%"></div>
          <div class="progress__nums">${sec.lessonsDone} / ${sec.lessonsTotal}</div>
        </div>
        <img class="progress__trophy" src="${trophy}" onerror="this.onerror=null;this.src='${trophy.replace('assets','assest')}'" alt="" />
      </div>
      ${note}
      <div class="section-card__actions">
        <a class="see-details" href="${detailsHref}" aria-expanded="false">See details</a>
        <button class="btn-continue" data-id="${sec.number}" ${locked?'disabled':''}>${btnLabel}</button>
      </div>
    </div>
    <div class="section-card__img">
      <div class="character">
        <img src="${sec.mascot}" alt="Section ${sec.number} mascot" class="character__img" />
        ${speechBubble(sec.phrase)}
      </div>
    </div>
    </article>`;
  }

  function renderUnit(sectionNum, unit){
    const assetRoot = 'assets/general';
    const mascotPath = `${assetRoot}/section${sectionNum}_unit_${unit.number}.svg`;
    const mascotFallback = `${assetRoot}/section1_unit_1.svg`;
    const lessons = unit.lessons || [];
    const hasReviewLesson = lessons.some(lesson => lesson && lesson.isReview);
    const allComplete = lessons.length > 0 && lessons.every(lesson => lesson.status === 'completed');
    const rewardDefined = unit.reward === 'chest' || unit.chest === true || (unit.reward && unit.reward.type === 'chest');
    const midpoint = lessons.length ? Math.ceil(lessons.length / 2) : 0;
    const mascotSide = unit.number % 2 === 0 ? 'left' : 'right';
    const rows = [];
    const iconForStatus = status => {
      switch(status){
        case 'completed':
        case 'complete':
          return `${assetRoot}/lesson_complete.svg`;
        case 'unlocked':
        case 'start':
          return `${assetRoot}/start_lesson.svg`;
        default:
          return `${assetRoot}/lesson_locked.svg`;
      }
    };
    const altForStatus = status => {
      switch(status){
        case 'completed':
        case 'complete':
          return 'Lesson completed';
        case 'unlocked':
        case 'start':
          return 'Start lesson';
        default:
          return 'Locked lesson';
      }
    };
    const trophyIconForStatus = status => {
      switch(status){
        case 'completed':
        case 'complete':
          return `${assetRoot}/trophy-gold_1.svg`;
        default:
          return `${assetRoot}/trophy-silver_1.svg`;
      }
    };
    const altForReview = status => {
      switch(status){
        case 'completed':
        case 'complete':
          return 'Review completed';
        case 'unlocked':
        case 'start':
          return 'Start review';
        default:
          return 'Review locked';
      }
    };

    lessons.forEach((lesson, index) => {
      const status = lesson.status || 'locked';
      const isReview = Boolean(lesson && lesson.isReview);
      const side = index % 2 === 0 ? 'left' : 'right';
      const rowClasses = ['lesson-row', `lesson-row--${isReview ? 'center' : side}`, 'lesson-row--lesson'];
      if(isReview) rowClasses.push('trophy');
      const buttonClasses = ['lesson', `lesson--${status}`];
      if(isReview) buttonClasses.push('lesson--review');
      const iconSrc = isReview ? trophyIconForStatus(status) : iconForStatus(status);
      const altText = isReview ? altForReview(status) : altForStatus(status);
      const lessonIdAttr = lesson && lesson.id ? ` data-lesson-id="${escapeAttribute(lesson.id)}"` : '';
      const skillAttr = lesson && lesson.skillId ? ` data-skill-id="${escapeAttribute(lesson.skillId)}"` : '';
      const levelAttr = lesson && lesson.levelId ? ` data-level-id="${escapeAttribute(lesson.levelId)}"` : '';
      const lessonNumber = typeof lesson.lessonIndex === 'number' ? lesson.lessonIndex : index + 1;
      const totalLessons = lessons.length;
      const popoverId = `lesson-popover-${sectionNum}-${unit.number}-${index + 1}`;
      const popoverTitleId = `${popoverId}-title`;
      const popoverClasses = ['lesson-popover'];
      if(status === 'locked') popoverClasses.push('lesson-popover--locked');
      const metaMarkup = totalLessons ? `<p class="lesson-popover__meta">Lesson ${lessonNumber} out of ${totalLessons}</p>` : '';
      const lockedMessage = status === 'locked'
        ? '<p class="lesson-popover__message">Complete all levels above to unlock this!</p>'
        : '';
      const actionAttrs = status === 'locked'
        ? 'type="button" class="lesson-popover__action lesson-popover__action--locked" disabled'
        : 'type="button" class="lesson-popover__action lesson-popover__action--start" data-lesson-action="start"';
      const actionLabel = status === 'locked' ? 'Locked' : 'Begin lesson!';
      const safeTitle = escapeHtml(lesson && lesson.title ? lesson.title : `Lesson ${lessonNumber}`);
      rows.push(`
        <div class="${rowClasses.join(' ')}">
          <button type="button" class="${buttonClasses.join(' ')}"${lessonIdAttr}${skillAttr}${levelAttr} aria-expanded="false" aria-haspopup="true" aria-controls="${popoverId}">
            <img src="${iconSrc}" alt="${altText}" />
          </button>
          <div class="${popoverClasses.join(' ')}" id="${popoverId}" role="group" aria-hidden="true" aria-labelledby="${popoverTitleId}" hidden>
            <h3 id="${popoverTitleId}" class="lesson-popover__title">${safeTitle}</h3>
            ${metaMarkup}
            ${lockedMessage}
            <button ${actionAttrs}>${actionLabel}</button>
          </div>
        </div>`);
      if(index === midpoint - 1){
        rows.push(`
          <div class="lesson-row mascot lesson-row--${mascotSide}">
            <img src="${mascotPath}" onerror="this.onerror=null;this.src='${mascotFallback}'" alt="Unit mascot" />
          </div>`);
      }
    });

    if(!lessons.length){
      rows.push(`
        <div class="lesson-row mascot lesson-row--${mascotSide}">
          <img src="${mascotPath}" onerror="this.onerror=null;this.src='${mascotFallback}'" alt="Unit mascot" />
        </div>`);
    }
    if(rewardDefined){
      rows.push(`
        <div class="lesson-row lesson-row--center chest">
          <img src="${assetRoot}/path.svg" alt="Reward chest" />
        </div>`);
    }

    if(allComplete && !hasReviewLesson){
      rows.push(`
        <div class="lesson-row lesson-row--center trophy">
          <img src="${assetRoot}/trophy-gold_1.svg" alt="Trophy" />
        </div>`);
    }

    return `
    <section class="unit">
      <header class="unit-header">
        <hr /><h2>${unit.title}</h2><hr />
      </header>
      <div class="unit-path">
        <div class="unit-connector" aria-hidden="true">
          <svg class="unit-connector__trail" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 72.94 100" preserveAspectRatio="xMidYMin slice">
            <defs>
              <pattern id="unit-connector-pattern-${sectionNum}-${unit.number}" patternUnits="userSpaceOnUse" width="72.94" height="80">
                <image href="${assetRoot}/path.svg" width="72.94" height="31.31" x="0" y="24" preserveAspectRatio="xMidYMid meet" />
              </pattern>
            </defs>
            <rect class="unit-connector__fill" width="72.94" height="100" fill="url(#unit-connector-pattern-${sectionNum}-${unit.number})" />
          </svg>
        </div>
        ${rows.join('')}
      </div>
    </section>`;
  }

  function renderSection(number){
    const sec = sections.find(s => String(s.number) === String(number));
    if(!sec){
      container.innerHTML = '<p>Section not found.</p>';
      return;
    }
    const unitsMarkup = sec.units.length
      ? sec.units.map(unit => renderUnit(sec.number, unit)).join('')
      : '<p class="unit-path__empty">No units available yet.</p>';

    container.innerHTML = `<div class="section-page">
    <button class="btn-back" data-action="back">← Back</button>
    ${unitsMarkup}
  </div>`;
    resetLessonPopoverState();
    connectLessons('Pronouns + key words', "Ask 'How are you?'");
  }

  function handleClick(e){
    if(lessonPopoverState.activePopover && !e.target.closest('.lesson-row')){
      closeLessonPopover();
    }

    const continueBtn = e.target.closest('.btn-continue, .overview-cta .btn-primary');
    if(continueBtn){
      const id = continueBtn.dataset.id;
      const sec = sections.find(s=>String(s.number) === String(id));
      if(sec && sec.status !== 'locked') location.hash = `#/section/${id}`;
      return;
    }

    const backBtn = e.target.closest('[data-action="back"]');
    if(backBtn){
      location.hash = '#/learn';
      return;
    }

    const lessonTrigger = e.target.closest('.lesson');
    if(lessonTrigger){
      const row = lessonTrigger.closest('.lesson-row');
      const popoverId = lessonTrigger.getAttribute('aria-controls');
      const popover = popoverId ? row?.querySelector(`#${popoverId}`) : row?.querySelector('.lesson-popover');
      if(popover){
        if(popover.hidden){
          openLessonPopover(popover, lessonTrigger);
        }else{
          closeLessonPopover(popover);
        }
      }
      return;
    }

    const startLessonBtn = e.target.closest('[data-lesson-action="start"]');
    if(startLessonBtn){
      const row = startLessonBtn.closest('.lesson-row');
      const popover = row?.querySelector('.lesson-popover');
      closeLessonPopover(popover, { focusTrigger: true });
      return;
    }

    const unitToggle = e.target.closest('[data-unit-toggle]');
    if(unitToggle){
      const node = unitToggle.closest('.unit-node');
      if(node && !node.classList.contains('is-locked')){
        const expanded = unitToggle.getAttribute('aria-expanded') === 'true';
        unitToggle.setAttribute('aria-expanded', (!expanded).toString());
        node.classList.toggle('is-open', !expanded);
        const lessons = node.querySelector('.unit-node__lessons');
        if(lessons){
          lessons.hidden = expanded;
        }
      }
    }
  }

  function openLessonPopover(popover, trigger){
    if(!popover || !trigger) return;
    if(lessonPopoverState.activePopover && lessonPopoverState.activePopover !== popover){
      closeLessonPopover();
    }
    const row = trigger.closest('.lesson-row');
    if(row){
      row.classList.add('lesson-row--popover-open');
    }
    popover.hidden = false;
    popover.setAttribute('aria-hidden', 'false');
    popover.classList.add('is-open');
    trigger.setAttribute('aria-expanded', 'true');
    lessonPopoverState.activePopover = popover;
    lessonPopoverState.activeTrigger = trigger;
  }

  function closeLessonPopover(popover = lessonPopoverState.activePopover, { focusTrigger = false } = {}){
    if(!popover){
      lessonPopoverState.activePopover = null;
      lessonPopoverState.activeTrigger = null;
      return;
    }
    if(!popover.isConnected){
      lessonPopoverState.activePopover = null;
      lessonPopoverState.activeTrigger = null;
      return;
    }
    const row = popover.closest('.lesson-row');
    if(row){
      row.classList.remove('lesson-row--popover-open');
    }
    popover.hidden = true;
    popover.setAttribute('aria-hidden', 'true');
    popover.classList.remove('is-open');
    const trigger = row?.querySelector('.lesson') || lessonPopoverState.activeTrigger;
    if(trigger && trigger.isConnected){
      trigger.setAttribute('aria-expanded', 'false');
      if(focusTrigger){
        trigger.focus();
      }
    }
    if(lessonPopoverState.activePopover === popover){
      lessonPopoverState.activePopover = null;
      lessonPopoverState.activeTrigger = null;
    }
  }

  function resetLessonPopoverState(){
    lessonPopoverState.activePopover = null;
    lessonPopoverState.activeTrigger = null;
  }

  async function router(){
    await ensureSections();
    const hash = location.hash || '#/learn';
    const m = hash.match(/^#\/section\/(\d+)/);
    if(m){
      renderSection(m[1]);
    }else{
      renderLearn();
    }
  }

  container.addEventListener('click', handleClick);
  container.addEventListener('keydown', e => {
    if(e.key === 'Escape' && lessonPopoverState.activePopover){
      e.preventDefault();
      closeLessonPopover(undefined, { focusTrigger: true });
    }
  });
  ensureSections().then(() => {
    router();
    window.addEventListener('hashchange', router);
  });

  function readOverviewData(){
    const el = document.getElementById('sections-overview-data');
    if(!el){
      return {
        '1': {
          tagline: 'Start with essential phrases and simple grammar concepts',
          summary: 'Focus on must-know phrases, SOV word order, and subject omission.',
          helpfulHints: [
            'Sinhala often drops “am/is/are” in simple present.',
            'The question marker “da” (ද) turns a statement into a question.',
            'Use “-gé” (ගේ) for possession with people and animals.'
          ],
          grammarConcepts: [
            {
              title: 'Word order (Sinhala)',
              explanation: 'Verb typically comes at the end; “is/are/am” may be implied.',
              examples: [
                { l1: 'මම හොඳින් ඉන්නවා. — mama hondin innavā.', gloss: 'I (am) fine.' },
                { l1: 'ඔයා කතා කරනවා. — oyā kathā karanavā.', gloss: 'You speak / are speaking.' }
              ]
            },
            {
              title: 'Possession with “-gé”',
              explanation: 'Attach “-gé” to people/animals for possession.',
              examples: [
                { l1: 'ඔයාගේ නම මොකක්ද? — oyāgé nama mokakda?', gloss: 'Your name, what? → What’s your name?' },
                { l1: 'මගේ රට ශ්‍රී ලංකාව. — magé raṭa Śrī Lankāva.', gloss: 'My country, Sri Lanka.' }
              ]
            }
          ],
          cta: {
            text: 'Start Section 1',
            href: '#/section/1'
          }
        }
      };
    }
    try{
      return JSON.parse(el.textContent.trim());
    }catch(err){
      console.error('Failed to parse overview data', err);
      return {};
    }
  }

  function getSectionSubtitle(sectionId, sec){
    const data = overviewData[sectionId];
    if(data && data.tagline) return data.tagline;
    if(sec.description) return sec.description;
    return '';
  }

  function setupSectionOverviews(){
    const cards = container.querySelectorAll('.section-card');
    cards.forEach(card => initialiseOverview(card));
  }

  function initialiseOverview(card){
    if(card.dataset.overviewBound === 'true') return;
    const sectionId = card.getAttribute('data-section-id');
    if(!sectionId) return;
    const trigger = card.querySelector('.see-details');
    if(!trigger) return;

    const titleEl = card.querySelector('.section-title');
    if(titleEl && !titleEl.id){
      titleEl.id = `section-${sectionId}-title`;
    }

    const panelId = `section-overview-${sectionId}`;
    const subtitleEl = card.querySelector('.section-subtitle');
    let panel = card.querySelector(`#${panelId}`);
    if(!panel){
      panel = document.createElement('div');
      panel.className = 'section-overview';
      panel.id = panelId;
      panel.hidden = true;
      panel.setAttribute('aria-live', 'polite');
      panel.setAttribute('aria-expanded', 'false');
      panel.dataset.transitioning = 'false';
      panel.style.maxHeight = '0px';
      trigger.insertAdjacentElement('afterend', panel);
    }

    panel.setAttribute('role', 'region');
    if(titleEl){
      panel.setAttribute('aria-labelledby', titleEl.id);
    }else{
      panel.setAttribute('aria-label', `Section ${sectionId} overview`);
    }

    const subtitleText = subtitleEl ? subtitleEl.textContent.trim() : '';
    renderOverviewPanel(panel, overviewData[sectionId], sectionId, titleEl, subtitleText);

    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', panelId);

    const handleToggle = event => {
      event.preventDefault();
      event.stopPropagation();
      const isExpanded = panel.getAttribute('aria-expanded') === 'true';
      if(isExpanded){
        collapsePanel(panel, { focusTrigger: true });
      }else{
        expandPanel(panel, trigger);
      }
    };

    trigger.addEventListener('click', handleToggle);
    trigger.addEventListener('keydown', event => {
      if(event.key === ' '){
        event.preventDefault();
        handleToggle(event);
      }
    });

    panel.addEventListener('click', event => {
      if(event.target.closest('.overview-close')){
        event.preventDefault();
        collapsePanel(panel, { focusTrigger: true });
      }
    });

    panel.addEventListener('keydown', event => {
      if(event.key === 'Escape'){
        event.preventDefault();
        collapsePanel(panel, { focusTrigger: true });
      }
    });

    card.dataset.overviewBound = 'true';
  }

  function renderOverviewPanel(panel, sectionData = {}, sectionId, titleEl, subtitleText = ''){
    const headingText = titleEl ? `${titleEl.textContent.trim()} overview` : `Section ${sectionId} overview`;
    const headingId = `${panel.id}-heading`;
    const safeHeading = escapeHtml(headingText);
    const taglineText = sectionData && sectionData.tagline ? sectionData.tagline : subtitleText;
    const tagline = taglineText ? `<p class="overview-tagline">${escapeHtml(taglineText)}</p>` : '';
    const summary = sectionData && sectionData.summary ? `<p class="overview-summary">${escapeHtml(sectionData.summary)}</p>` : '';
    const hints = Array.isArray(sectionData && sectionData.helpfulHints) ? sectionData.helpfulHints.slice(0) : [];
    const concepts = Array.isArray(sectionData && sectionData.grammarConcepts) ? sectionData.grammarConcepts.slice(0) : [];
    const hasContent = Boolean(summary || hints.length || concepts.length || (sectionData && sectionData.cta));
    const hintsMarkup = hints.length ? `
      <h4 class="overview-subheading">Helpful hints</h4>
      <ul class="overview-hints">
        ${hints.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
      </ul>
    ` : '';

    const conceptsMarkup = concepts.length ? `
      <h4 class="overview-subheading">Grammar concepts</h4>
      <div class="overview-concepts">
        ${concepts.map(concept => renderConcept(concept)).join('')}
      </div>
    ` : '';

    const sectionInfo = sections.find(sec => String(sec.number) === String(sectionId));
    const canShowCTA = sectionInfo && sectionInfo.status !== 'locked';
        const ctaMarkup = canShowCTA
      ? '<div class="overview-cta"></div>'
      : '';

    const placeholder = hasContent ? '' : '<p class="overview-placeholder">Overview coming soon.</p>';

    panel.innerHTML = `
      <div class="overview-header">
        <h3 class="overview-heading" id="${headingId}">${safeHeading}</h3>
        <button type="button" class="overview-close" aria-label="Close overview for ${escapeAttribute(titleEl ? titleEl.textContent.trim() : `Section ${sectionId}`)}">×</button>
      </div>
      ${tagline || ''}
      ${summary || ''}
      ${hintsMarkup}
      ${conceptsMarkup}
      ${ctaMarkup}
      ${placeholder}
    `;

    panel.setAttribute('aria-expanded', 'false');
    panel.hidden = true;

    panel.dataset.sectionId = sectionId;

    if(canShowCTA){
      updateCTAForSection(sectionInfo.number);
    }
  }

  function updateCTAForSection(sectionId){
    const { section } = getSectionRecord(sectionId);
    if(!section) return;
    const card = container.querySelector(`.section-card[data-section-id="${sectionId}"]`);
    if(!card) return;
    const ctaContainer = card.querySelector('.overview-cta');
    if(!ctaContainer) return;

    ctaContainer.innerHTML = '';
    if(section.status === 'locked') return;

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('data-id', sectionId);
    button.className = 'btn-continue';
    const label = section.cta || (section.progress > 0 ? 'Continue' : `Start Section ${sectionId}`);
    button.textContent = label;
    ctaContainer.appendChild(button);
  }

  function getSectionRecord(sectionId){
    const index = sections.findIndex(sec => String(sec.number) === String(sectionId));
    return { index, section: index >= 0 ? sections[index] : null };
  }

  function clamp(value, min, max){
    return Math.min(max, Math.max(min, value));
  }

  function refreshSectionCard(section){
    if(!section) return;
    const card = container.querySelector(`.section-card[data-section-id="${section.number}"]`);
    if(card){
      const pct = Math.round((Number(section.progress) || 0) * 100);
      const fill = card.querySelector('.progress__fill');
      if(fill) fill.style.width = `${pct}%`;
      const nums = card.querySelector('.progress__nums');
      if(nums) nums.textContent = `${section.lessonsDone} / ${section.lessonsTotal}`;
      const bar = card.querySelector('.progress');
      if(bar){
        bar.setAttribute('aria-valuenow', section.lessonsDone);
        bar.setAttribute('aria-valuemax', section.lessonsTotal);
      }
      const trophy = card.querySelector('.progress__trophy');
      if(trophy){
        const nextSrc = trophySrc(section.progress);
        if(trophy.getAttribute('src') !== nextSrc){
          trophy.setAttribute('src', nextSrc);
        }
      }
      const mainBtn = card.querySelector('.btn-continue');
      if(mainBtn){
        const locked = section.status === 'locked';
        mainBtn.disabled = locked;
        const label = locked ? 'Locked' : (section.cta || (section.progress > 0 ? 'Continue' : `Start Section ${section.number}`));
        mainBtn.textContent = label;
      }
    }
    updateCTAForSection(section.number);
  }

  function refreshSectionDetailIfActive(section){
    const match = location.hash.match(/^#\/section\/(\d+)/);
    if(match && String(match[1]) === String(section.number)){
      renderSection(section.number);
    }
  }

  function setSectionState(sectionId, patch = {}){
    const { index, section } = getSectionRecord(sectionId);
    if(index < 0 || !section) return null;
    const totalLessons = Number(section.lessonsTotal) || 0;
    let lessonsDone = Object.prototype.hasOwnProperty.call(patch, 'lessonsDone')
      ? clamp(Math.round(Number(patch.lessonsDone) || 0), 0, totalLessons)
      : section.lessonsDone;
    let progress = Object.prototype.hasOwnProperty.call(patch, 'progress')
      ? clamp(Number(patch.progress) || 0, 0, 1)
      : section.progress;

    if(Object.prototype.hasOwnProperty.call(patch, 'progress') && !Object.prototype.hasOwnProperty.call(patch, 'lessonsDone')){
      lessonsDone = totalLessons ? Math.round(progress * totalLessons) : 0;
    }else if(Object.prototype.hasOwnProperty.call(patch, 'lessonsDone') && !Object.prototype.hasOwnProperty.call(patch, 'progress')){
      progress = totalLessons ? lessonsDone / totalLessons : 0;
    }

    const nextStatus = Object.prototype.hasOwnProperty.call(patch, 'status')
      ? patch.status
      : (progress >= 1 ? 'completed' : (section.status === 'locked' && progress <= 0 ? 'locked' : 'unlocked'));

    const nextCTA = Object.prototype.hasOwnProperty.call(patch, 'cta')
      ? patch.cta
      : (progress > 0 ? 'Continue' : `Start Section ${section.number}`);

    const updated = {
      ...section,
      ...patch,
      lessonsDone,
      progress,
      status: nextStatus,
      cta: nextCTA
    };

    sections[index] = updated;
    refreshSectionCard(updated);
    refreshSectionDetailIfActive(updated);
    window.dispatchEvent(new CustomEvent('learn:section-updated', { detail: { section: { ...updated } } }));
    return updated;
  }

  function setSectionProgress(sectionId, progressValue){
    return setSectionState(sectionId, { progress: progressValue });
  }

  function getSectionsSnapshot(){
    return sections.map(sec => ({ ...sec }));
  }

  function renderConcept(concept){
    const title = concept && concept.title ? escapeHtml(concept.title) : '';
    const explanation = concept && concept.explanation ? `<p>${escapeHtml(concept.explanation)}</p>` : '';
    const examples = Array.isArray(concept && concept.examples) ? concept.examples.slice(0, 2) : [];
    const examplesMarkup = examples.length ? `
      <div class="overview-examples">
        ${examples.map(example => renderExample(example)).join('')}
      </div>
    ` : '';
    return `
      <section class="overview-concept">
        ${title ? `<h5>${title}</h5>` : ''}
        ${explanation}
        ${examplesMarkup}
      </section>
    `;
  }

  function renderExample(example){
    const l1 = example && example.l1 ? escapeHtml(example.l1) : '';
    const gloss = example && example.gloss ? escapeHtml(example.gloss) : '';
    return `
      <div class="overview-example">
        ${l1 ? `<span class="example-l1">${l1}</span>` : ''}
        ${gloss ? `<span class="example-gloss">${gloss}</span>` : ''}
      </div>
    `;
  }

  function escapeHtml(value){
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeAttribute(value){
    return escapeHtml(value).replace(/`/g, '&#96;');
  }

  function expandPanel(panel, trigger){
    if(!panel || panel.dataset.transitioning === 'true') return;
    closeAll(panel);
    panel.hidden = false;
    panel.dataset.transitioning = 'true';
    panel.setAttribute('aria-expanded', 'true');
    if(trigger){
      trigger.setAttribute('aria-expanded', 'true');
    }
    panel.style.maxHeight = '0px';
    requestAnimationFrame(() => {
      panel.style.maxHeight = `${panel.scrollHeight}px`;
    });
    onPanelTransition(panel, () => {
      panel.dataset.transitioning = 'false';
      panel.style.maxHeight = `${panel.scrollHeight}px`;
      focusPanelHeading(panel);
      overviewState.activePanel = panel;
      overviewState.activeTrigger = trigger || null;
    });
  }

  function collapsePanel(panel, { focusTrigger = false } = {}){
    if(!panel || panel.dataset.transitioning === 'true') return;
    const trigger = panel.closest('.section-card')?.querySelector('.see-details');
    panel.dataset.transitioning = 'true';
    panel.setAttribute('aria-expanded', 'false');
    if(trigger){
      trigger.setAttribute('aria-expanded', 'false');
    }
    panel.style.maxHeight = `${panel.scrollHeight}px`;
    requestAnimationFrame(() => {
      panel.style.maxHeight = '0px';
    });
    onPanelTransition(panel, () => {
      panel.hidden = true;
      panel.dataset.transitioning = 'false';
      if(overviewState.activePanel === panel){
        overviewState.activePanel = null;
        overviewState.activeTrigger = null;
      }
      if(focusTrigger && trigger){
        trigger.focus();
      }
    });
  }

  function closeAll(except){
    container.querySelectorAll('.section-overview[aria-expanded="true"]').forEach(panel => {
      if(panel !== except){
        collapsePanel(panel);
      }
    });
  }

  function focusPanelHeading(panel){
    const heading = panel.querySelector('.overview-heading');
    if(!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
    const removeTabIndex = () => {
      heading.removeAttribute('tabindex');
      heading.removeEventListener('blur', removeTabIndex);
    };
    heading.addEventListener('blur', removeTabIndex);
  }

  function onPanelTransition(panel, callback){
    const styles = window.getComputedStyle(panel);
    const duration = parseFloat(styles.transitionDuration || '0') + parseFloat(styles.transitionDelay || '0');
    if(!duration){
      callback();
      return;
    }
    let settled = false;
    const handle = event => {
      if(event.target === panel && event.propertyName === 'max-height'){
        settled = true;
        panel.removeEventListener('transitionend', handle);
        callback();
      }
    };
    panel.addEventListener('transitionend', handle);
    window.setTimeout(() => {
      if(!settled){
        panel.removeEventListener('transitionend', handle);
        callback();
      }
    }, OVERVIEW_TRANSITION_MS + 50);
  }

  async function ensureCourseHierarchy(){
    if(courseHierarchyState.ready && !courseHierarchyState.promise) return courseHierarchyState;
    if(courseHierarchyState.promise) return courseHierarchyState.promise;
    const load = fetch('data/course.index.json', { cache: 'no-cache' })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        const sections = Array.isArray(data)
          ? data
          : (data && Array.isArray(data.sections) ? data.sections : []);
        courseHierarchyState.sections = sections;
        courseHierarchyState.unitMap = new Map();
        sections.forEach(section => {
          const units = Array.isArray(section.units) ? section.units : [];
          units.forEach(unit => {
            courseHierarchyState.unitMap.set(unit.id, { unit, section });
          });
        });
        courseHierarchyState.ready = true;
        courseHierarchyState.promise = null;
        return courseHierarchyState;
      })
      .catch(err => {
        console.error('learn: failed to load course index', err);
        courseHierarchyState.sections = [];
        courseHierarchyState.unitMap = new Map();
        courseHierarchyState.ready = true;
        courseHierarchyState.promise = null;
        return courseHierarchyState;
      });
    courseHierarchyState.promise = load;
    return load;
  }

  async function ensureUnitLessonData(unitId){
    if(!unitId) return null;
    const cached = lessonDataCache.get(unitId);
    if(cached){
      if(typeof cached.then === 'function') return cached;
      return Promise.resolve(cached);
    }
    const promise = fetch(`data/${unitId}.lessons.json`, { cache: 'no-cache' })
      .then(res => res.ok ? res.json() : null)
      .catch(err => {
        console.warn('learn: failed to load lesson data for', unitId, err);
        return null;
      })
      .then(data => {
        lessonDataCache.set(unitId, data);
        return data;
      });
    lessonDataCache.set(unitId, promise);
    return promise;
  }

  function normalizeLevelLessons(level){
    const refs = Array.isArray(level && level.lessons) ? level.lessons : [];
    return refs.map((ref, index) => {
      if(typeof ref === 'string'){
        return { id: ref, order: index + 1 };
      }
      if(ref && typeof ref === 'object'){
        return {
          ...ref,
          id: ref.id || ref.lessonId || '',
          order: index + 1
        };
      }
      return { id: '', order: index + 1 };
    });
  }

  async function getLessonPositionMeta({ unitId, skillId, levelId, lessonId } = {}){
    if(!unitId){
      return {
        currentIndex: 0,
        totalLessons: 0,
        lesson: null,
        lessonId: '',
        skill: null,
        level: null,
        unit: null,
        section: null,
        type: null,
        isReview: false
      };
    }

    const hierarchy = await ensureCourseHierarchy();
    const entry = hierarchy.unitMap.get(unitId);
    if(!entry || !entry.unit){
      return {
        currentIndex: 0,
        totalLessons: 0,
        lesson: null,
        lessonId: lessonId || '',
        skill: null,
        level: null,
        unit: null,
        section: null,
        type: null,
        isReview: false
      };
    }

    const skills = Array.isArray(entry.unit.skills) ? entry.unit.skills : [];
    const skill = skills.find(s => (skillId && (s.skillId === skillId || s.id === skillId))) || skills[0] || null;
    if(!skill){
      return {
        currentIndex: 0,
        totalLessons: 0,
        lesson: null,
        lessonId: lessonId || '',
        skill: null,
        level: null,
        unit: entry.unit,
        section: entry.section,
        type: null,
        isReview: false
      };
    }

    const levels = Array.isArray(skill.levels) ? skill.levels : [];
    const level = levels.find(l => (levelId && (l.levelId === levelId || l.id === levelId))) || levels[0] || null;
    if(!level){
      return {
        currentIndex: 0,
        totalLessons: 0,
        lesson: null,
        lessonId: lessonId || '',
        skill,
        level: null,
        unit: entry.unit,
        section: entry.section,
        type: null,
        isReview: false
      };
    }

    const lessons = normalizeLevelLessons(level);
    const declaredTotal = Number(level.lessonCount) || 0;
    const fallbackTotal = lessons.length;
    const totalLessons = declaredTotal || fallbackTotal;

    let targetId = lessonId || '';
    let matchIndex = -1;
    if(targetId){
      matchIndex = lessons.findIndex(item => item.id === targetId);
    }
    if(matchIndex < 0 && lessons.length){
      targetId = lessons[0].id;
      matchIndex = 0;
    }
    const currentIndex = matchIndex >= 0 ? matchIndex + 1 : 0;

    const lessonData = await ensureUnitLessonData(unitId);
    let lessonDetail = null;
    if(lessonData && Array.isArray(lessonData.lessons)){
      lessonDetail = lessonData.lessons.find(item => item.id === targetId) || null;
    }

    const typeValue = lessonDetail && lessonDetail.type
      ? lessonDetail.type
      : (matchIndex >= 0 && lessons[matchIndex] && lessons[matchIndex].type ? lessons[matchIndex].type : null);
    const isReview = typeValue === 'review';

    return {
      currentIndex,
      totalLessons,
      lesson: lessonDetail,
      lessonId: targetId,
     skill,
      level,
      unit: entry.unit,
      section: entry.section,
      type: typeValue,
      isReview
    };
  }

  async function getLessonCounterText(params = {}){
    const meta = await getLessonPositionMeta(params);
    if(!meta.totalLessons || !meta.currentIndex) return '';
    return `Lesson ${meta.currentIndex} of ${meta.totalLessons}`;
  }

  const learnAPI = {
    ensureSections,
    getSectionsSnapshot,
    setSectionState,
    setSectionProgress,
    updateCTAForSection,
    getLessonPosition: getLessonPositionMeta,
    getLessonCounterText
  };
  window.__LEARN__ = Object.assign(window.__LEARN__ || {}, learnAPI);
  window.connectLessons = connectLessons;
})();