(function(){
  const container = document.getElementById('view-learn');
  if(!container) return;

  const SECTION_ROOT = 'assets/sections';
  let sections = [];
  let loadingPromise = null;

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
    const cta = section.cta || (status === 'locked' ? 'Locked' : 'Continue');
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
      return sections;
    });
    return loadingPromise;
  }

  function renderLearn(){
    const cards = sections.map(sec => sectionCard(sec)).join('');
    const listMarkup = cards || '<p class="unit-path__empty">No sections available yet.</p>';
    container.innerHTML = `<div class="learn-wrap"><div class="sections-list">${listMarkup}</div><aside class="learn-rail hide-mobile"><h3>Coming soon</h3></aside></div>`;
  }

  function sectionCard(sec){
    const pct = Math.round(sec.progress * 100);
    const locked = sec.status === 'locked';
    const trophy = trophySrc(sec.progress);
    const note = locked ? '<small class="locked-note">Finish previous to unlock</small>' : '';
    const btnLabel = locked ? 'Locked' : sec.cta;
    return `<article class="section-card"><div class="section-card__left">
      <button class="btn-details" data-id="${sec.number}">see details</button>
      <h3>${sec.title}</h3>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${sec.lessonsTotal}" aria-valuenow="${sec.lessonsDone}">
        <div class="progress__fill" style="width:${pct}%"></div>
        <div class="progress__nums">${sec.lessonsDone} / ${sec.lessonsTotal}</div>
        <img class="progress__trophy" src="${trophy}" onerror="this.onerror=null;this.src='${trophy.replace('assets','assest')}'" alt="" />
      </div>
      ${note}
      <button class="btn-continue" data-id="${sec.number}" ${locked?'disabled':''}>${btnLabel}</button>
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
          <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${sec.lessonsTotal}" aria-valuenow="${sec.lessonsDone}">
            <div class="progress__fill" style="width:${pct}%"></div>
            <div class="progress__nums">${sec.lessonsDone} / ${sec.lessonsTotal}</div>
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
    const continueBtn = e.target.closest('.btn-continue');
    if(continueBtn){
      const id = continueBtn.dataset.id;
      const sec = sections.find(s=>String(s.number) === String(id));
      if(sec && sec.status !== 'locked') location.hash = `#/section/${id}`;
      return;
    }

    const detailBtn = e.target.closest('.btn-details');
    if(detailBtn){
      const id = detailBtn.dataset.id;
      location.hash = `#/section/${id}`;
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
})();
