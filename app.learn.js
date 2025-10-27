(function(){
  const container = document.getElementById('view-learn');
  if(!container) return;

  const resolveAsset = typeof window !== 'undefined' && window.__BASHA_RESOLVE_ASSET_PATH__
    ? window.__BASHA_RESOLVE_ASSET_PATH__
    : (value => value);

  const SECTION_ROOT = 'assets/sections';
  const overviewSeedData = readOverviewSeedData();
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
  function trophySrc(progress){
    const file = progress >= 1 ? 'trophy-gold_1.svg' : 'trophy-silver_1.svg';
    return resolveAsset(`assets/general/${file}`);
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
    const baseMascot = section.mascot || `${SECTION_ROOT}/${slug}/mascot.svg`;
    const mascot = resolveAsset(baseMascot);
    const units = (section.units || []).map((unit, index) => normalizeUnit(unit, index));
    const lessonsTotal = units.reduce((sum, unit) => sum + unit.lessonsTotal, 0);
    const lessonsDone = units.reduce((sum, unit) => sum + unit.lessonsCompleted, 0);
    const progress = lessonsTotal ? lessonsDone / lessonsTotal : 0;
    const status = section.status || (progress >= 1 ? 'completed' : units.some(u => u.status !== 'locked') ? 'unlocked' : 'locked');
    const cta = section.cta || (status === 'locked'
      ? 'Locked'
      : (progress > 0 ? 'Continue' : `Start Section ${number}`));
    const baseOverview = section.overview && typeof section.overview === 'object'
      ? { ...section.overview }
      : {};
    const mergedOverview = mergeOverviewData(baseOverview, getOverviewSeed(section.number || number));

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
      cta,
      overview: mergedOverview
    };
  }

  async function loadSections(){
        const found = [];
    for(let index = 1; index <= 50; index += 1){
      const slug = `section-${index}`;
      const path = resolveAsset(`${SECTION_ROOT}/${slug}/units.json`);
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

  function resetLessonPopoverState(){
    const panels = container.querySelectorAll('.section-overview');
    panels.forEach(panel => {
      collapsePanel(panel, { immediate: true });
      const card = panel.closest('.section-card');
      const trigger = card ? card.querySelector('.see-details') : null;
      if(trigger){
        trigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function updateCTAForSection(sectionId, config = {}){
    if(!sectionId) return;
    const options = typeof config === 'string' ? { text: config } : (config || {});
    const { text, href, disabled } = options;
    const card = container.querySelector(`.section-card[data-section-id="${sectionId}"]`);
    if(!card) return;

    const continueBtn = card.querySelector('.btn-continue');
    if(continueBtn){
      if(typeof text === 'string'){
        continueBtn.textContent = text;
      }
      if(typeof disabled === 'boolean'){
        continueBtn.disabled = disabled;
      }
      if(typeof href === 'string' && href){
        continueBtn.setAttribute('data-href', href);
      }
    }

    const overviewCTA = card.querySelector('.overview-cta-button');
    if(overviewCTA){
      if(typeof text === 'string'){
        overviewCTA.textContent = text;
      }
      if(typeof href === 'string' && href){
        overviewCTA.setAttribute('href', href);
      }else if(href === null){
        overviewCTA.removeAttribute('href');
      }
    }

    const record = getSectionRecord(sectionId);
    if(record && record.section){
      if(typeof text === 'string'){
        record.section.cta = text;
      }
      if(typeof disabled === 'boolean'){
        record.section.status = disabled ? 'locked' : record.section.status;
      }
    }
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
    const cardNodes = container.querySelectorAll('.section-card');
    cardNodes.forEach(card => initialiseOverview(card));
  }

  function sectionCard(sec){
    const pct = Math.round(sec.progress * 100);
    const locked = sec.status === 'locked';
    const trophy = trophySrc(sec.progress);
    const note = locked ? '<small class="locked-note">Finish previous to unlock</small>' : '';
    const completed = sec.status === 'completed' || sec.progress >= 1;
    const btnLabel = locked ? 'Locked' : completed ? 'Completed!' : sec.cta;
    const sectionId = String(sec.number);
    const subtitle = sec.description || '';
    const titleId = `section-${sectionId}-title`;
    return `<article class="section-card" data-section-id="${sectionId}">
    <div class="section-card__left">
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
        <button class="btn-continue" data-id="${sec.number}" ${locked?'disabled':''}>${btnLabel}</button>
        <button type="button" class="see-details" aria-expanded="false" aria-controls="section-overview-${sectionId}">See details</button>
      </div>
    </div>
    <div class="section-card__img">
      <div class="character">
        <img src="${sec.mascot}" alt="Section ${sec.number} mascot" class="character__img" />
        ${speechBubble(sec.phrase)}
      </div>
    </div>
    <div class="section-units" hidden data-expanded="false" aria-expanded="false" aria-hidden="true"></div>
    </article>`;
  }

  function initialiseOverview(card){
    if(!card) return null;
    const sectionId = card.getAttribute('data-section-id');
    if(!sectionId) return null;
    const trigger = card.querySelector('.see-details');
    if(!trigger) return null;
    const { section } = getSectionRecord(sectionId);
    if(!section) return null;

    const titleEl = card.querySelector('.section-title');
    const subtitleEl = card.querySelector('.section-subtitle');
    const subtitleText = subtitleEl ? subtitleEl.textContent.trim() : '';
    const panelId = `section-overview-${sectionId}`;
    let panel = card.querySelector('.section-overview');
    if(!panel){
      panel = document.createElement('div');
      panel.className = 'section-overview';
      const leftCol = card.querySelector('.section-card__left') || card;
      const actions = card.querySelector('.section-card__actions');
      if(actions && actions.parentElement === leftCol){
        actions.insertAdjacentElement('afterend', panel);
      }else{
        leftCol.append(panel);
      }
    }

    panel.id = panelId;
    panel.setAttribute('role', 'region');
    if(titleEl && titleEl.id){
      panel.setAttribute('aria-labelledby', titleEl.id);
    }
    panel.setAttribute('tabindex', '-1');
    panel.dataset.sectionId = sectionId;

    trigger.setAttribute('aria-controls', panelId);
    trigger.setAttribute('aria-expanded', panel.dataset.expanded === 'true' ? 'true' : 'false');
    if(panel.dataset.expanded !== 'true'){
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('aria-expanded', 'false');
      panel.dataset.expanded = 'false';
    }

    renderOverviewPanel(panel, section, sectionId, titleEl, subtitleText);

    if(!panel.dataset.boundEvents){
      panel.addEventListener('click', event => {
        const closeBtn = event.target.closest('.overview-close');
        if(closeBtn){
          const owningCard = panel.closest('.section-card');
          const owningTrigger = owningCard ? owningCard.querySelector('.see-details') : null;
          collapsePanel(panel, {
            trigger: owningTrigger,
            onComplete: () => {
              if(owningTrigger) owningTrigger.focus();
            }
          });
        }
      });
      panel.addEventListener('keydown', event => {
        if(event.key === 'Escape' || event.key === 'Esc'){
          event.stopPropagation();
          const owningCard = panel.closest('.section-card');
          const owningTrigger = owningCard ? owningCard.querySelector('.see-details') : null;
          collapsePanel(panel, {
            trigger: owningTrigger,
            onComplete: () => {
              if(owningTrigger) owningTrigger.focus();
            }
          });
        }
      });
      panel.dataset.boundEvents = 'true';
    }

    return panel;
  }

  function renderOverviewPanel(panel, sectionData, sectionId, titleEl, subtitleText){
    if(!panel) return;
    const titleText = titleEl ? titleEl.textContent.trim() : (sectionData && sectionData.title) || `Section ${sectionId}`;
    const overview = sectionData && typeof sectionData.overview === 'object' ? sectionData.overview : {};
    const tagline = overview.tagline || subtitleText || '';
    const summary = overview.summary || sectionData.description || '';
    const helpfulHints = Array.isArray(overview.helpfulHints)
      ? overview.helpfulHints.map(item => {
        if(!item) return '';
        if(typeof item === 'string') return item;
        if(typeof item === 'object') return item.text || item.tip || item.title || '';
        return String(item);
      }).filter(Boolean)
      : [];
    const grammarConcepts = Array.isArray(overview.grammarConcepts)
      ? overview.grammarConcepts.map(concept => {
        if(!concept) return null;
        if(typeof concept === 'string'){
          return { title: concept };
        }
        if(typeof concept === 'object') return concept;
        return null;
      }).filter(Boolean)
      : [];
    const cta = overview.cta && typeof overview.cta === 'object' ? overview.cta : {};
    const ctaLabel = cta.label || cta.text || sectionData.cta || (sectionData.progress > 0 ? 'Continue' : 'Start');
    const ctaHref = typeof cta.href === 'string' ? cta.href : '';

    const headingMarkup = `<div class="overview-header"><h3 class="overview-heading">${escapeHtml(`${titleText} overview`)}</h3><button type="button" class="overview-close" aria-label="Close details">&times;</button></div>`;
    const taglineMarkup = tagline ? `<p class="overview-tagline">${escapeHtml(tagline)}</p>` : '';
    const summaryMarkup = summary ? `<p class="overview-summary">${escapeHtml(summary)}</p>` : '';

    const hintsMarkup = helpfulHints.length
      ? `<h4 class="overview-subheading">Helpful hints</h4><ul class="overview-hints">${helpfulHints.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
      : '';

    const conceptsMarkup = grammarConcepts.length
      ? `<h4 class="overview-subheading">Grammar concepts</h4><div class="overview-concepts">${grammarConcepts.map(concept => {
        if(!concept || typeof concept !== 'object') return '';
        const conceptTitle = concept.title || '';
        const explanation = concept.explanation || concept.summary || '';
        const examples = Array.isArray(concept.examples) ? concept.examples.filter(Boolean).slice(0, 2) : [];
        const exampleMarkup = examples.map(example => {
          if(!example) return '';
          if(typeof example === 'string'){
            return `<div class="overview-example"><p class="example-l1">${escapeHtml(example)}</p></div>`;
          }
          const primary = example.l1 || example.text || example.sentence || example.example || example.phrase || '';
          const gloss = example.gloss || example.translation || example.meaning || '';
          const primaryMarkup = primary ? `<p class="example-l1">${escapeHtml(primary)}</p>` : '';
          const glossMarkup = gloss ? `<p class="example-gloss">${escapeHtml(gloss)}</p>` : '';
          return `<div class="overview-example">${primaryMarkup}${glossMarkup}</div>`;
        }).join('');
        const explanationMarkup = explanation ? `<p>${escapeHtml(explanation)}</p>` : '';
        const titleMarkup = conceptTitle ? `<h5>${escapeHtml(conceptTitle)}</h5>` : '';
        return `<article class="overview-concept">${titleMarkup}${explanationMarkup}${examples.length ? `<div class="overview-examples">${exampleMarkup}</div>` : ''}</article>`;
      }).join('')}</div>`
      : '';

    const hasContent = Boolean(taglineMarkup || summaryMarkup || hintsMarkup || conceptsMarkup);
    const placeholderMarkup = hasContent ? '' : '<p class="overview-placeholder">Overview details coming soon. Stay tuned!</p>';

    const ctaMarkup = ctaLabel
      ? `<div class="overview-cta">${ctaHref
        ? `<a class="overview-cta-button" href="${escapeAttribute(ctaHref)}">${escapeHtml(ctaLabel)}</a>`
        : `<button type="button" class="overview-cta-button" data-id="${escapeAttribute(sectionId)}">${escapeHtml(ctaLabel)}</button>`}</div>`
      : '';

    panel.innerHTML = `${headingMarkup}${taglineMarkup}${summaryMarkup}${hintsMarkup}${conceptsMarkup}${placeholderMarkup}${ctaMarkup}`;

    if(panel.dataset.expanded === 'true'){
      panel.hidden = false;
      panel.removeAttribute('hidden');
      panel.setAttribute('aria-hidden', 'false');
      panel.setAttribute('aria-expanded', 'true');
      panel.style.maxHeight = `${panel.scrollHeight}px`;
    }else{
      panel.style.maxHeight = '0px';
    }
  }

  function closeAll(except){
    const panels = container.querySelectorAll('.section-overview');
    panels.forEach(panel => {
      if(panel === except) return;
      const card = panel.closest('.section-card');
      const trigger = card ? card.querySelector('.see-details') : null;
      collapsePanel(panel, { trigger });
    });
  }

  function expandPanel(panel, trigger){
    if(!panel) return;
    closeAll(panel);
    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.dataset.expanded = 'true';
    panel.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('is-open');
    if(trigger){
      trigger.setAttribute('aria-expanded', 'true');
    }
    panel.style.maxHeight = '0px';
    panel.getBoundingClientRect();
    panel.style.maxHeight = `${panel.scrollHeight}px`;
    const onEnd = event => {
      if(event.target !== panel || (event.propertyName && event.propertyName !== 'max-height')) return;
      panel.style.maxHeight = `${panel.scrollHeight}px`;
      panel.removeEventListener('transitionend', onEnd);
    };
    panel.addEventListener('transitionend', onEnd);
    requestAnimationFrame(() => {
      try{
        panel.focus({ preventScroll: true });
      }catch(err){
        panel.focus();
      }
    });
  }

  function collapsePanel(panel, opts = {}){
    if(!panel) return;
    const { trigger = null, immediate = false, onComplete } = opts;
    const isExpanded = panel.dataset.expanded === 'true' || panel.getAttribute('aria-expanded') === 'true';
    const finish = () => {
      panel.hidden = true;
      panel.setAttribute('aria-hidden', 'true');
      panel.setAttribute('aria-expanded', 'false');
      panel.dataset.expanded = 'false';
      panel.classList.remove('is-open');
      panel.style.maxHeight = '';
      if(trigger){
        trigger.setAttribute('aria-expanded', 'false');
      }
      if(typeof onComplete === 'function') onComplete();
    };

    if(!isExpanded && panel.hidden){
      finish();
      return;
    }

    if(immediate){
      finish();
      return;
    }

    const currentHeight = panel.scrollHeight;
    panel.style.maxHeight = `${currentHeight}px`;
    panel.getBoundingClientRect();
    panel.style.maxHeight = '0px';
    const onEnd = event => {
      if(event.target !== panel || (event.propertyName && event.propertyName !== 'max-height')) return;
      panel.removeEventListener('transitionend', onEnd);
      finish();
    };
    panel.addEventListener('transitionend', onEnd);
  }

  function renderUnit(sectionNum, unit){
    const assetRoot = 'assets/general';
    const mascotPath = resolveAsset(`${assetRoot}/section${sectionNum}_unit_${unit.number}.svg`);
    const mascotFallback = resolveAsset(`${assetRoot}/section1_unit_1.svg`);
    const lessons = unit.lessons || [];
    const hasReviewLesson = lessons.some(lesson => lesson && lesson.isReview);
    const allComplete = lessons.length > 0 && lessons.every(lesson => lesson.status === 'completed');
    const rewardDefined = unit.reward === 'chest' || unit.chest === true || (unit.reward && unit.reward.type === 'chest');
    const midpoint = lessons.length ? Math.ceil(lessons.length / 2) : 0;
    const mascotSide = unit.number % 2 === 0 ? 'left' : 'right';
    const rows = [];
    const fallbackBubbleTitle = unit.title || '';
    const fallbackBubbleTotal = lessons.length || 0;
    const lessonBubbleMeta = new Map();
    const skillTitleById = new Map();

    if(Array.isArray(unit.skills)){
      unit.skills.forEach(skill => {
        if(!skill || typeof skill !== 'object') return;
        const skillId = skill.skillId || skill.id || '';
        const skillTitle = skill.title || fallbackBubbleTitle;
        if(skillId){
          skillTitleById.set(skillId, skillTitle);
        }
        const levels = Array.isArray(skill.levels) ? skill.levels : [];
        if(levels.length){
          levels.forEach(level => {
            if(!level || typeof level !== 'object') return;
            const levelKey = level.levelId || level.id || '';
            const levelTotal = Number(level.lessonCount) || (Array.isArray(level.lessons) ? level.lessons.length : 0);
            if(levelKey){
              lessonBubbleMeta.set(levelKey, {
                title: skillTitle,
                total: levelTotal
              });
            }
          });
        }else if(skillId){
          const levelTotal = Number(skill.lessonCount) || 0;
          if(levelTotal > 0){
            lessonBubbleMeta.set(skillId, {
              title: skillTitle,
              total: levelTotal
            });
          }
        }
      });
    }
    const iconForStatus = status => {
      switch(status){
        case 'completed':
        case 'complete':
          return resolveAsset(`${assetRoot}/lesson_complete.svg`);
        case 'unlocked':
        case 'start':
          return resolveAsset(`${assetRoot}/start_lesson.svg`);
        default:
          return resolveAsset(`${assetRoot}/lesson_locked.svg`);
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
          return resolveAsset(`${assetRoot}/trophy-gold_1.svg`);
        default:
          return resolveAsset(`${assetRoot}/trophy-silver_1.svg`);
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
      const rawTitle = lesson && lesson.title ? lesson.title : `Lesson ${lessonNumber}`;
      const titleAttr = rawTitle ? ` aria-label="${escapeAttribute(rawTitle)}"` : '';
      const bubbleKey = lesson && (lesson.levelId || lesson.skillId) ? (lesson.levelId || lesson.skillId) : '__unit__';
      if(!lessonBubbleMeta.has(bubbleKey)){
        const derivedTitle = (lesson && lesson.skillId && skillTitleById.get(lesson.skillId)) || fallbackBubbleTitle || rawTitle;
        const groupTotal = lessons.filter(item => {
          const groupKey = item && (item.levelId || item.skillId) ? (item.levelId || item.skillId) : '__unit__';
          return groupKey === bubbleKey;
        }).length;
        lessonBubbleMeta.set(bubbleKey, {
          title: derivedTitle,
          total: groupTotal || fallbackBubbleTotal || lessons.length || 1
        });
      }
      const bubbleMeta = lessonBubbleMeta.get(bubbleKey) || { title: fallbackBubbleTitle || rawTitle, total: fallbackBubbleTotal || lessons.length || 1 };
      const bubbleTitle = bubbleMeta.title || rawTitle;
      const totalLessons = bubbleMeta.total || fallbackBubbleTotal || lessons.length || 1;
      const isLocked = status === 'locked';
      const bubbleCta = isLocked
        ? 'Complete all levels above to unlock this!'
        : 'Start Lesson!!';

      rows.push(`
        <div class="${rowClasses.join(' ')}">
          <button type="button" class="${buttonClasses.join(' ')}"${lessonIdAttr}${skillAttr}${levelAttr}${titleAttr} aria-expanded="false">
            <img src="${iconSrc}" alt="${altText}" />
          </button>
          <div class="lesson-bubble" data-lesson-bubble hidden>
            <div class="lesson-bubble__content">
              <div class="lesson-bubble__header">
                <p class="lesson-bubble__title">${escapeHtml(bubbleTitle)}</p>
                <p class="lesson-bubble__meta">Lesson ${lessonNumber} of ${totalLessons}</p>
              </div>
              <div class="lesson-bubble__footer">
                <button type="button" class="lesson-bubble__cta" data-lesson-status="${status}"${isLocked ? ' disabled' : ''}>${escapeHtml(bubbleCta)}</button>
              </div>
            </div>
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
  }

  function closeLessonBubbles(except){
    const bubbles = container.querySelectorAll('.lesson-bubble:not([hidden])');
    bubbles.forEach(bubble => {
      if(except && bubble === except) return;
      const wasOpen = bubble.classList.contains('is-open');
      bubble.classList.remove('is-open');
      if(wasOpen){
        const handle = event => {
          if(event.target !== bubble) return;
          if(!bubble.classList.contains('is-open')){
            bubble.setAttribute('hidden', '');
          }
          bubble.removeEventListener('transitionend', handle);
        };
        bubble.addEventListener('transitionend', handle);
      }else if(!bubble.hasAttribute('hidden')){
        bubble.setAttribute('hidden', '');
      }
      const button = bubble.previousElementSibling;
      if(button && button.matches('.lesson')){
        button.setAttribute('aria-expanded', 'false');
      }
    });
  }

  function openLessonBubble(button, bubble){
    if(!bubble || !button) return;
    closeLessonBubbles(bubble);
    bubble.removeAttribute('hidden');
    bubble.getBoundingClientRect();
    bubble.classList.add('is-open');
    button.setAttribute('aria-expanded', 'true');
  }

 function toggleLessonBubble(button){
    if(!button) return;
    const row = button.closest('.lesson-row');
    if(!row) return;
    const bubble = row.querySelector('.lesson-bubble');
    if(!bubble) return;
    const isOpen = bubble.classList.contains('is-open');
    if(isOpen){
      closeLessonBubbles();
    }else{
      openLessonBubble(button, bubble);
    }
  }

  function expandSectionUnits(sectionId){
    if(location.hash !== '#/learn' && location.hash !== '#learn'){
      location.hash = '#/learn';
      window.addEventListener('hashchange', function handleExpand(){
        setTimeout(() => {
          performSectionExpansion(sectionId);
        }, 100);
        window.removeEventListener('hashchange', handleExpand);
      }, { once: true });
    }else{
      performSectionExpansion(sectionId);
    }
  }

  function performSectionExpansion(sectionId){
    const card = container.querySelector(`.section-card[data-section-id="${sectionId}"]`);
    if(!card) return;
    
    const unitsContainer = card.querySelector('.section-units');
    if(unitsContainer && !unitsContainer.dataset.rendered){
      renderSectionUnits(card, sectionId);
    }
    
    const unitsPanel = card.querySelector('.section-units');
    if(unitsPanel){
      expandSectionUnitsPanel(unitsPanel, card);
      
      setTimeout(() => {
        card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        card.classList.add('section-highlight');
        setTimeout(() => card.classList.remove('section-highlight'), 2000);
      }, 150);
    }
  }

  function renderSectionUnits(card, sectionId){
    const sec = sections.find(s => String(s.number) === String(sectionId));
    if(!sec) return;
    
    const unitsContainer = card.querySelector('.section-units');
    if(!unitsContainer) return;
    
    const unitsMarkup = sec.units.length
      ? sec.units.map(unit => renderUnit(sec.number, unit)).join('')
      : '<p class="unit-path__empty">No units available yet.</p>';
    
    unitsContainer.innerHTML = unitsMarkup;
    unitsContainer.dataset.rendered = 'true';
  }

  function expandSectionUnitsPanel(panel, card){
    if(!panel || !card) return;
    
    const isExpanded = panel.dataset.expanded === 'true';
    if(isExpanded) return;
    
    panel.hidden = false;
    panel.removeAttribute('hidden');
    panel.dataset.expanded = 'true';
    panel.setAttribute('aria-expanded', 'true');
    panel.setAttribute('aria-hidden', 'false');
    panel.classList.add('is-open');
    
    panel.style.maxHeight = '0px';
    panel.getBoundingClientRect();
    panel.style.maxHeight = `${panel.scrollHeight}px`;
    
    const onEnd = event => {
      if(event.target !== panel || (event.propertyName && event.propertyName !== 'max-height')) return;
      panel.style.maxHeight = 'none';
      panel.removeEventListener('transitionend', onEnd);
    };
    panel.addEventListener('transitionend', onEnd);
  }

  function handleClick(e){
    const lessonButton = e.target.closest('.lesson-row--lesson .lesson');
    if(lessonButton){
      toggleLessonBubble(lessonButton);
      return;
    }

    const lessonCtaButton = e.target.closest('.lesson-bubble__cta');
    if(lessonCtaButton && !lessonCtaButton.disabled){
      const row = lessonCtaButton.closest('.lesson-row');
      if(row){
        const lessonBtn = row.querySelector('.lesson');
        if(lessonBtn){
          const lessonId = lessonBtn.dataset.lessonId || '';
          const skillId = lessonBtn.dataset.skillId || '';
          const levelId = lessonBtn.dataset.levelId || '';
          const lessonTitle = lessonBtn.getAttribute('aria-label') || 'Lesson';
          
          if(lessonId && typeof window.LessonSimulator !== 'undefined' && window.LessonSimulator.open){
            const defaultExercises = ['translate-to-base', 'match-pairs', 'translate-to-target'];
            window.LessonSimulator.open({
              lessonTitle,
              lessonNumberText: '',
              sectionTitle: '',
              unitTitle: '',
              lessonDetail: null,
              lessonMeta: { lessonId, skillId, levelId },
              selectedExercises: defaultExercises,
              trigger: lessonCtaButton
            });
          }
        }
      }
      return;
    }

    const seeDetailsButton = e.target.closest('.see-details');
    if(seeDetailsButton){
      const card = seeDetailsButton.closest('.section-card');
      const panel = card ? initialiseOverview(card) : null;
      if(!panel) return;
      const isExpanded = seeDetailsButton.getAttribute('aria-expanded') === 'true';
      if(isExpanded){
        collapsePanel(panel, { trigger: seeDetailsButton });
      }else{
        expandPanel(panel, seeDetailsButton);
      }
      return;
    }

    if(!e.target.closest('.lesson-bubble__content')){
      closeLessonBubbles();
    }

    const continueBtn = e.target.closest('.btn-continue');
    if(continueBtn){
      const id = continueBtn.dataset.id;
      const sec = sections.find(s=>String(s.number) === String(id));
      if(sec && sec.status !== 'locked'){
        window.location.hash = `#/section/${id}`;
      }
      return;
    }

    const overviewCtaBtn = e.target.closest('button.overview-cta-button');
    if(overviewCtaBtn){
      const id = overviewCtaBtn.dataset.id || overviewCtaBtn.closest('.section-card')?.getAttribute('data-section-id');
      const sec = sections.find(s=>String(s.number) === String(id));
      if(sec && sec.status !== 'locked'){
        const panel = overviewCtaBtn.closest('.section-overview');
        collapsePanel(panel, {
          onComplete: () => expandSectionUnits(id)
        });
      }
      return;
    }

    const backBtn = e.target.closest('[data-action="back"]');
    if(backBtn){
      location.hash = '#/learn';
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
  ensureSections().then(() => {
    router();
    window.addEventListener('hashchange', router);
  });

  function getSectionRecord(sectionId){
    const index = sections.findIndex(sec => String(sec.number) === String(sectionId));
    return { index, section: index >= 0 ? sections[index] : null };
  }

  function readOverviewSeedData(){
    const script = document.getElementById('sections-overview-data');
    if(!script) return new Map();
    const text = script.textContent || script.innerText || '';
    if(!text.trim()) return new Map();
    try{
      const parsed = JSON.parse(text);
      const map = new Map();
      if(parsed && typeof parsed === 'object'){
        Object.keys(parsed).forEach(key => {
          const value = parsed[key];
          if(value && typeof value === 'object'){
            map.set(String(key), value);
          }
        });
      }
      return map;
    }catch(err){
      console.error('learn: failed to parse overview seed data', err);
      return new Map();
    }
  }

  function getOverviewSeed(sectionId){
    if(!sectionId) return null;
    const key = String(sectionId);
    return overviewSeedData.has(key) ? overviewSeedData.get(key) : null;
  }

  function mergeOverviewData(base = {}, seed = null){
    const merged = base && typeof base === 'object' ? { ...base } : {};
    if(seed && typeof seed === 'object'){
      if(Object.prototype.hasOwnProperty.call(seed, 'tagline')){
        merged.tagline = seed.tagline;
      }
      if(Object.prototype.hasOwnProperty.call(seed, 'summary')){
        merged.summary = seed.summary;
      }
      if(Object.prototype.hasOwnProperty.call(seed, 'helpfulHints')){
        merged.helpfulHints = Array.isArray(seed.helpfulHints) ? seed.helpfulHints.slice() : seed.helpfulHints;
      }
      if(Object.prototype.hasOwnProperty.call(seed, 'grammarConcepts')){
        merged.grammarConcepts = Array.isArray(seed.grammarConcepts) ? seed.grammarConcepts.slice() : seed.grammarConcepts;
      }
      if(Object.prototype.hasOwnProperty.call(seed, 'cta')){
        const baseCTA = merged.cta && typeof merged.cta === 'object' ? merged.cta : {};
        merged.cta = seed.cta && typeof seed.cta === 'object' ? { ...baseCTA, ...seed.cta } : baseCTA;
      }
    }
    return merged;
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
      initialiseOverview(card);
    }
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

  async function ensureCourseHierarchy(){
    if(courseHierarchyState.ready && !courseHierarchyState.promise) return courseHierarchyState;
    if(courseHierarchyState.promise) return courseHierarchyState.promise;
    const load = fetch(resolveAsset('data/course.index.json'), { cache: 'no-cache' })
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
    const promise = fetch(resolveAsset(`data/${unitId}.lessons.json`), { cache: 'no-cache' })
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
    getLessonCounterText,
    renderOverview: renderLearn,
    renderSection
  };
  window.__LEARN__ = Object.assign(window.__LEARN__ || {}, learnAPI);
  window.BashaLearn = window.BashaLearn || {};
  window.BashaLearn.renderOverview = renderLearn;
  window.BashaLearn.renderSection = renderSection;
})();
