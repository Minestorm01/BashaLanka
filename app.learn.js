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
    container.innerHTML = `<div class="learn-wrap"><div class="sections-list">${cards}</div><aside class="right-rail"><p class=\"muted\">Coming soon</p></aside></div>`;
  }

  function sectionCard(sec){
    const pct = Math.round(sec.progress * 100);
    const locked = sec.status !== 'unlocked';
    const trophy = trophySrc(sec.progress);
    const note = locked ? '<small class="locked-note">Finish previous to unlock</small>' : '';
    const btnLabel = locked ? 'Locked' : sec.cta;
    return `<article class="section-card"><div class="card-info">
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
    <div class="mascot-wrap">
      <div class="speech-bubble">
        <img src="assets/general/speech-bubble.svg" onerror="this.onerror=null;this.src='assest/general/speech-bubble.svg'" alt="" />
        <div class="speech-text"><div class="roman">${sec.phrase.romanised}</div><div class="si">${sec.phrase.si}</div></div>
      </div>
      <img class="mascot" src="${sec.img}" onerror="this.onerror=null;this.src='${sec.img.replace('assets','assest')}'" alt="" />
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
        <div class="speech-bubble">
          <img src="assets/general/speech-bubble.svg" onerror="this.onerror=null;this.src='assest/general/speech-bubble.svg'" alt="" />
          <div class="speech-text"><div class="roman">${sec.phrase.romanised}</div><div class="si">${sec.phrase.si}</div></div>
        </div>
        <img class="mascot" src="${sec.img}" onerror="this.onerror=null;this.src='${sec.img.replace('assets','assest')}'" alt="" />
      </div>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${sec.lessonsTotal}" aria-valuenow="${sec.lessonsDone}">
        <div class="progress__fill" style="width:${pct}%"></div>
        <div class="progress__nums">${sec.lessonsDone} / ${sec.lessonsTotal}</div>
        <img class="progress__trophy" src="${trophy}" onerror="this.onerror=null;this.src='${trophy.replace('assets','assest')}'" alt="" />
      </div>
    </div>`;
  }

  function handleClick(e){
    const continueBtn = e.target.closest('.btn-continue');
    if(continueBtn){
      const id = continueBtn.dataset.id;
      const sec = sections.find(s=>s.id==id);
      if(sec && sec.status==='unlocked') location.hash = `#/section/${id}`;
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
    }
  }

  function router(){
    const hash = location.hash || '#/learn';
    const m = hash.match(/^#\/section\/(\d+)/);
    if(m){
      renderSection(m[1]);
    }else{
      renderLearn();
    }
  }

  container.addEventListener('click', handleClick);
  fetch('data/learn.sections.json').then(r=>r.json()).then(data=>{sections = data.sections || []; router();});
  window.addEventListener('hashchange', router);
})();
