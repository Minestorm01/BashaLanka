// BashaLanka starter — minimal router + Home render
const qs = (s, el=document)=>el.querySelector(s);
const qsa = (s, el=document)=>[...el.querySelectorAll(s)];
const state = {
  hearts: 5,
  streak: 0,
  xp: 0,
  courseIndex: null
};

async function loadIndex(){
  if(state.courseIndex) return state.courseIndex;
  const res = await fetch('data/course.index.json');
  if(!res.ok){ throw new Error('Failed to load course index'); }
  const json = await res.json();
  state.courseIndex = json;
  return json;
}

function route(){
  const hash = location.hash || '#/home';
  const [_, path, param] = hash.split('/'); // '', 'home' or 'lesson', 'id'
  if(path === 'lesson'){
    renderLessonStub(param);
  } else {
    renderHome();
  }
}

function topbar(){
  return `
  <header class="topbar">
    <div class="brand">
      <img src="assets/logo.svg" alt="logo">
      <h1>BashaLanka</h1>
    </div>
    <div class="status">
      <span class="pill">❤️ ${state.hearts}</span>
      <span class="pill">🔥 ${state.streak}</span>
      <span class="pill">★ ${state.xp}</span>
    </div>
  </header>`;
}

async function renderHome(){
  const app = qs('#app');
  let index;
  try{
    index = await loadIndex();
  }catch(e){
    app.innerHTML = topbar() + `<main class="main"><div class="note">Error loading course index: ${e.message}</div></main>`;
    return;
  }

  const s1 = index.sections[0];
  const unitCards = s1.units.map(u => {
    const locked = u.status !== 'unlocked';
    const targetLesson = `${u.id}-l1`;
    const cardInner = `
      <div class="badge">${u.lessons} lessons</div>
      <h3>${u.title}</h3>
      <div class="meta">${locked ? 'Locked — finish previous unit' : 'Start at Lesson 1'}</div>
    `;
    if(locked){
      return `<div class="card locked">${cardInner}</div>`;
    }
    return `<a class="card a cardlink" href="#/lesson/${targetLesson}">${cardInner}</a>`;
  }).join('');

  app.innerHTML = `
    ${topbar()}
    <main class="main">
      <section class="hero">
        <h2>BashaLanka — Learn Sinhala the smart way</h2>
        <p>Short daily lessons • Real speech practice • Script-friendly UI</p>
        <div class="actions">
          <a class="btn" href="#/lesson/${s1.units[0].id}-l1">Start Section 1</a>
          <button class="btn secondary" disabled>Continue</button>
        </div>
      </section>

      <div class="section">Section 1 — ${s1.title}</div>
      <div class="grid">
        ${unitCards}
      </div>
    </main>
    <footer class="footer">© BashaLanka • Privacy • Terms</footer>
  `;
}

function renderLessonStub(id='unknown'){
  const app = qs('#app');
  app.innerHTML = `
    ${topbar()}
    <main class="main">
      <div class="route-title">Lesson coming soon</div>
      <p class="meta">ID: ${id}</p>
      <div class="actions">
        <a class="btn" href="#/home">Back to Home</a>
      </div>
      <div class="section">Developer note</div>
      <pre class="code">Add a real lesson renderer at route: #/lesson/:id</pre>
    </main>
    <footer class="footer">© BashaLanka • Privacy • Terms</footer>
  `;
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', () => {
  // register service worker (non-blocking)
  if('serviceWorker' in navigator){
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }
  route();
});
