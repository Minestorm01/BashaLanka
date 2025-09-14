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
       position: relative;
  width: clamp(120px, 20vw, 180px);
  flex: 0 0 auto;
}

.character {
  position: relative;
  width: 100%;
  display: grid;
  place-items: center;
}

.character__img {
  display: block;
  width: 100%;
  height: auto;
  max-width: 100%;
}

/* ============ Speech bubble ============ */
.speech-bubble {
  position: absolute;
  top: -12%;
  left: -12%;
  transform: translate(0, 0);
  background: #1a6460;
  color: #e6f1ff;
  border: 1px solid #3d7b78;
  border-radius: 14px;
  padding: clamp(8px, 1.8vw, 12px) clamp(10px, 2.2vw, 14px);
  box-shadow: 0 6px 14px rgba(0, 0, 0, 0.25);
  max-width: min(80vw, 220px);
  z-index: 2;
}

.speech-bubble::after {
  content: "";
  position: absolute;
  bottom: -10px;
  left: 28px;
  width: 0;
  height: 0;
  border-left: 10px solid transparent;
  border-right: 10px solid transparent;
  border-top: 10px solid #1a6460;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.25));
}

.speech-line {
  margin: 0;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.speech-line.romanised {
  font-weight: 600;
  font-size: clamp(11px, 2.3vw, 13px);
  color: #9db8ff;
  letter-spacing: 0.3px;
}

.speech-line.sinhala {
  font-weight: 700;
  font-size: clamp(14px, 3vw, 18px);
  color: #e6f1ff;
}

@media (max-width: 480px) {
