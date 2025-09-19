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
  let sections = [];
  let loadingPromise = null;
  let sectionsLoadedEventSent = false;

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

  function lessonStats(lessons){
    const total = lessons.length;
    const completed = lessons.filter(l => l.status === 'completed').length;
    const unlocked = lessons.filter(l => l.status === 'completed' || l.status === 'unlocked').length;
    return { total, completed, unlocked };
  }

  function normalizeUnit(unit){
    const lessons = (unit.lessons || []).map(lesson => ({
      id: lesson.id || '',
      title: lesson.title || 'Untitled lesson',
      status: lesson.status || unit.status || 'locked'
    }));
    const { total, completed, unlocked } = lessonStats(lessons);
    const progress = total ? completed / total : 0;
    let status = unit.status || 'locked';
        if(status !== 'locked' && completed >= total && total > 0){
      status = 'completed';
    }else if(status === 'locked' && unlocked > 0){
      status = 'unlocked';
    }
    return {
      ...unit,
      status,
      lessons,
      lessonsTotal: total,
      lessonsCompleted: completed,
      lessonsUnlocked: unlocked,
      progress
    };
  }

  function normalizeSection(section){
    const slug = section.id || `section-${section.number || ''}`;
    const number = section.number || parseInt((slug.match(/(\d+)/) || [])[1] || sections.length + 1, 10);
    const mascot = section.mascot || `${SECTION_ROOT}/${slug}/mascot.svg`;
    const units = (section.units || []).map(normalizeUnit);
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

  function unitStatusLabel(unit){
    if(unit.status === 'locked') return 'Locked';
    if(unit.status === 'completed' || unit.progress >= 1) return 'Completed';
    return 'In progress';
  }

  function lessonStatusLabel(status){
    if(status === 'completed') return 'Completed';
    if(status === 'unlocked') return 'Available';
    return 'Locked';
  }

  function renderLesson(lesson){
    const status = lesson.status || 'locked';
    const icon = status === 'completed' ? '✓' : status === 'unlocked' ? '•' : '🔒';
    return `<li class="lesson lesson--${status}" role="listitem">
      <span class="lesson__icon" aria-hidden="true">${icon}</span>
      <span class="lesson__title">${lesson.title}</span>
      <span class="lesson__state">${lessonStatusLabel(status)}</span>
    </li>`;
  }

  function renderUnit(unit, index, total){
    const locked = unit.status === 'locked';
    const showTop = index > 0;
    const showBottom = index < total - 1;
    const progressPct = Math.round(unit.progress * 100);
    const bubbleIcon = unit.icon || '🔰';
    const lessonsMarkup = unit.lessons.length
      ? `<div class="unit-node__lessons" hidden>
          <ul class="lesson-list" role="list">
            ${unit.lessons.map(renderLesson).join('')}
          </ul>
        </div>`
      : '';
    const buttonAttrs = locked ? 'type="button" disabled' : 'type="button"';
    return `<div class="unit-node ${locked ? 'is-locked' : ''}${unit.progress >= 1 ? ' is-complete' : ''}" role="listitem" data-unit="${unit.id}">
      <div class="unit-node__stem" aria-hidden="true">
        ${showTop ? '<span class="unit-node__line unit-node__line--top"></span>' : ''}
        <span class="unit-node__bubble">${bubbleIcon}</span>
        ${showBottom ? '<span class="unit-node__line unit-node__line--bottom"></span>' : ''}
      </div>
      <div class="unit-node__content">
        <button class="unit-node__header" ${buttonAttrs} data-unit-toggle="${unit.id}" aria-expanded="false">
          <div class="unit-node__title-wrap">
            <span class="unit-node__title">${unit.title}</span>
            <span class="unit-node__status">${unitStatusLabel(unit)}</span>
          </div>
          <div class="unit-node__meta">
            <span class="unit-node__count">${unit.lessonsCompleted}/${unit.lessonsTotal} lessons</span>
            <span class="unit-node__progress" aria-hidden="true">
              <span class="unit-node__progress-fill" style="width:${progressPct}%"></span>
            </span>
          </div>
        </button>
        ${lessonsMarkup}
      </div>
    </div>`;
  }

  function renderSection(number){
    const sec = sections.find(s => String(s.number) === String(number));
    if(!sec){
      container.innerHTML = '<p>Section not found.</p>';
      return;
    }
    const pct = Math.round(sec.progress * 100);
    const trophy = trophySrc(sec.progress);
    const unitsMarkup = sec.units.length
      ? sec.units.map((unit, index) => renderUnit(unit, index, sec.units.length)).join('')
      : '<p class="unit-path__empty">No units available yet.</p>';

    container.innerHTML = `<div class="section-page">
   <button class="btn-back" data-action="back">← Back</button>
      <div class="section-page__hero">
        <div class="section-page__info">
          <h2>${sec.title}</h2>
          ${sec.description ? `<p class="section-page__description">${sec.description}</p>` : ''}
          <div class="progress-row">
            <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${sec.lessonsTotal}" aria-valuenow="${sec.lessonsDone}">
              <div class="progress__fill" style="width:${pct}%"></div>
              <div class="progress__nums">${sec.lessonsDone} / ${sec.lessonsTotal}</div>
            </div>
            <img class="progress__trophy" src="${trophy}" onerror="this.onerror=null;this.src='${trophy.replace('assets','assest')}'" alt="" />
          </div>
        </div>
        <div class="section-page__mascot">
          <div class="character">
            <img src="${sec.mascot}" alt="Section ${sec.number} mascot" class="character__img" />
            ${speechBubble(sec.phrase)}
          </div>
        </div>
      </div>
      <div class="unit-path" role="list" aria-label="Units in ${sec.title}">
        ${unitsMarkup}
      </div>
    </div>`;
  }

  function handleClick(e){
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

  function readOverviewData(){
    const el = document.getElementById('sections-overview-data');
    if(!el){
      return {
        '1': {
          tagline: 'Start with essential phrases and simple grammar concepts',
          summary: 'Focus on must-know phrases, SOV word order, and subject omission.',
          helpfulHints: [
            'Sinhala often drops “am/is/are” in simple present.',
            'Question marker “dhȧ?” converts a statement into a question.',
            'Use “gé” for possession with living things (e.g., oyaa-gé).'
          ],
          grammarConcepts: [
            {
              title: 'Word order (Sinhala)',
              explanation: 'Verb typically comes at the end; “is/are/am” may be implied.',
              examples: [
                { l1: 'ma·mȧ hoňdhin in·nȧ·va.', gloss: 'I (am) fine.' },
                { l1: 'o·yaa ka·thaa kȧ·rȧ·nȧ·va.', gloss: 'You speak / are speaking.' }
              ]
            },
            {
              title: 'Possession with “gé”',
              explanation: 'Attach “gé” to people/animals for possession.',
              examples: [
                { l1: 'o·yaa·gé na·mȧ mo·kak·dhȧ?', gloss: 'Your name, what? → What’s your name?' },
                { l1: 'ma·gé ra·tȧ Shree lan·kaa·vȧ.', gloss: 'My country, Sri Lanka.' }
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

  const learnAPI = {
    ensureSections,
    getSectionsSnapshot,
    setSectionState,
    setSectionProgress,
    updateCTAForSection
  };
  window.__LEARN__ = Object.assign(window.__LEARN__ || {}, learnAPI);
})();