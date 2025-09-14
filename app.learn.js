 (function(){
  const container = document.getElementById('view-learn');
  if(!container) return;
  let sections = [];

  function trophySrc(progress){
    const file = progress === 1 ? 'trophy-gold.svg' : 'trophy-silver.svg';
    return `assets/general/${file}`;
  }

  function renderLearn(){
    const cards = sections.map(sec => sectionCard(sec)).join('');
    container.innerHTML = `<div class="learn-wrap"><div class="sections-list">${cards}</div><aside class="learn-rail hide-mobile"><h3>Coming soon</h3></aside></div>`;
  }

  function sectionCard(sec){
    const pct = Math.round(sec.progress * 100);
    const locked = sec.status !== 'unlocked';
    const trophy = trophySrc(sec.progress);
    const note = locked ? '<small class="locked-note">Finish previous to unlock</small>' : '';
    const btnLabel = locked ? 'Locked' : sec.cta;
    return `<article class="section-card"><div class="section-card__left">
      <button class="btn-details" data-id="${sec.id}">see details</button>
      <h3>${sec.title}</h3>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${sec.lessonsTotal}" aria-valuenow="${sec.lessonsDone}">
        <div class="progress__fill" style="width:${pct}%"></div>
        <div class="progress__nums">${sec.lessonsDone} / ${sec.lessonsTotal}</div>
        <img class="progress__trophy" src="${trophy}" onerror="this.onerror=null;this.src='${trophy.replace('assets','assest')}'" alt="" />
      </div>
      ${note}
      <button class="btn-continue" data-id="${sec.id}" ${locked?'disabled':''}>${btnLabel}</button>
    </div>
    <div class="section-card__img">
      <div class="character">
        <img src="${sec.img}" alt="Section ${sec.id} mascot" class="character__img" />
        <div class="speech-bubble" role="note" aria-label="Section phrase">
          <p class="speech-line romanised">${sec.phrase.romanised}</p>
          <p class="speech-line sinhala">${sec.phrase.si}</p>
        </div>
      </div>

    </div>
    </article>`;
  }

  function renderSection(id){
    const sec = sections.find(s => String(s.id) === String(id));
    if(!sec){ container.innerHTML = '<p>Not found</p>'; return; }
    const pct = Math.round(sec.progress * 100);
    const trophy = trophySrc(sec.progress);
    container.innerHTML = `<div class="section-page">
      <button class="btn-back" data-action="back">← Back</button>
      <h2>${sec.title}</h2>
      <div class="phrase-wrap">
        <div class="character">
          <img src="${sec.img}" alt="Section mascot" class="character__img" />
          <div class="speech-bubble" role="note" aria-label="Section phrase">
            <p class="speech-line romanised">${sec.phrase.romanised}</p>
            <p class="speech-line sinhala">${sec.phrase.si}</p>
          </div>
        </div>

      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${sec.lessonsTotal}" aria-valuenow="${sec.lessonsDone}">
        <div class="progress__fill" style="width:${pct}%"></div>
