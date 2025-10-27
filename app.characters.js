(function(){
  const container = document.getElementById('view-characters');
  if(!container) return;

  const grid = container.querySelector('#charGrid');
  if(!grid) return;

  const resolveAsset = typeof window !== 'undefined' && window.__BASHA_RESOLVE_ASSET_PATH__
    ? window.__BASHA_RESOLVE_ASSET_PATH__
    : (value => value);

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  let charactersData = null;
  let loadingPromise = null;
  let activeFilter = 'all';

  async function loadCharacters(){
    if(charactersData) return charactersData;
    if(loadingPromise) return loadingPromise;

    loadingPromise = (async () => {
      try{
        const path = resolveAsset('assets/data/characters.json');
        const res = await fetch(path, { cache: 'no-cache' });
        if(!res.ok) throw new Error('Failed to load characters data');
        const data = await res.json();
        charactersData = data;
        return data;
      }catch(err){
        console.error('Failed to load characters:', err);
        return null;
      }finally{
        loadingPromise = null;
      }
    })();

    return loadingPromise;
  }

  function getProgress(charId){
    try{
      const key = `char-progress-${charId}`;
      const stored = localStorage.getItem(key);
      if(!stored) return { mastery: 0, attempts: 0, correct: 0 };
      return JSON.parse(stored);
    }catch{
      return { mastery: 0, attempts: 0, correct: 0 };
    }
  }

  function renderCharacterCard(char, groupId){
    const charId = `${groupId}-${char.si}`;
    const progress = getProgress(charId);
    const mastery = progress.mastery || 0;
    const masteryPercent = Math.round(mastery * 100);
    const statusClass = mastery >= 0.8 ? 'mastered' : mastery >= 0.5 ? 'learning' : 'new';
    
    const audioPath = char.audio ? resolveAsset(`assets/Sinhala_Audio/${char.audio}`) : '';
    const playButton = audioPath 
      ? `<button type="button" class="char-card__audio" data-audio="${escapeHtml(audioPath)}" aria-label="Play pronunciation" title="Play pronunciation">🔊</button>`
      : '';

    return `
      <div class="char-card char-card--${statusClass}" data-char-id="${escapeHtml(charId)}">
        <div class="char-card__header">
          <div class="char-card__character">${escapeHtml(char.si)}</div>
          <div class="char-card__pronunciation">
            <div class="char-card__roman">${escapeHtml(char.roman || '')}</div>
            ${char.ipa ? `<div class="char-card__ipa">${escapeHtml(char.ipa)}</div>` : ''}
          </div>
        </div>
        <div class="char-card__body">
          ${char.meaning ? `<p class="char-card__meaning">${escapeHtml(char.meaning)}</p>` : ''}
          <div class="char-card__progress">
            <div class="char-card__progress-bar">
              <div class="char-card__progress-fill" style="width: ${masteryPercent}%"></div>
            </div>
            <span class="char-card__progress-text">${masteryPercent}% mastered</span>
          </div>
        </div>
        <div class="char-card__footer">
          ${playButton}
          <button type="button" class="btn btn--sm btn--primary char-card__practice" data-char="${escapeHtml(char.si)}">
            Practice
          </button>
        </div>
      </div>
    `;
  }

  function renderGroup(group){
    const characters = Array.isArray(group.characters) ? group.characters : [];
    const cardsHtml = characters.map(char => renderCharacterCard(char, group.id)).join('');
    
    return `
      <div class="char-group" data-group-id="${escapeHtml(group.id)}">
        <h2 class="char-group__title">${escapeHtml(group.title)}</h2>
        <div class="char-group__grid">
          ${cardsHtml}
        </div>
      </div>
    `;
  }

  function calculateProgress(data){
    if(!data || !Array.isArray(data.groups)) return { total: 0, mastered: 0, learning: 0, new: 0 };
    
    let total = 0, mastered = 0, learning = 0, newCount = 0;
    
    data.groups.forEach(group => {
      (group.characters || []).forEach(char => {
        const charId = `${group.id}-${char.si}`;
        const progress = getProgress(charId);
        const masteryLevel = progress.mastery || 0;
        total++;
        if(masteryLevel >= 0.8) mastered++;
        else if(masteryLevel >= 0.3) learning++;
        else newCount++;
      });
    });
    
    return { total, mastered, learning, new: newCount };
  }

  function renderProgressHeader(stats){
    const masteredPercent = stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;
    
    return `
      <div class="char-header">
        <div class="char-header__info">
          <h2 class="char-header__title">Sinhala Script</h2>
          <p class="char-header__desc">Master the Sinhala alphabet with interactive practice</p>
        </div>
        <div class="char-header__stats">
          <div class="char-stat char-stat--mastered">
            <div class="char-stat__value">${stats.mastered}</div>
            <div class="char-stat__label">Mastered</div>
          </div>
          <div class="char-stat char-stat--learning">
            <div class="char-stat__value">${stats.learning}</div>
            <div class="char-stat__label">Learning</div>
          </div>
          <div class="char-stat char-stat--new">
            <div class="char-stat__value">${stats.new}</div>
            <div class="char-stat__label">New</div>
          </div>
        </div>
        <div class="char-header__progress">
          <div class="char-progress-bar">
            <div class="char-progress-fill" style="width: ${masteredPercent}%"></div>
          </div>
          <span class="char-progress-text">${masteredPercent}% Complete</span>
        </div>
      </div>
    `;
  }

  function renderFilters(groups){
    const filters = [
      { id: 'all', label: 'All Characters' },
      ...groups.map(g => ({ id: g.id, label: g.title }))
    ];
    
    return `
      <div class="char-filters">
        ${filters.map(f => `
          <button 
            type="button" 
            class="char-filter ${activeFilter === f.id ? 'active' : ''}"
            data-filter="${escapeHtml(f.id)}"
          >
            ${escapeHtml(f.label)}
          </button>
        `).join('')}
      </div>
    `;
  }

  async function render(){
    grid.innerHTML = '<p class="loading">Loading characters...</p>';
    
    const data = await loadCharacters();
    if(!data || !Array.isArray(data.groups) || data.groups.length === 0){
      grid.innerHTML = '<p class="error">Failed to load character data.</p>';
      return;
    }

    const sortedGroups = data.groups.sort((a, b) => (a.order || 0) - (b.order || 0));
    const stats = calculateProgress(data);
    
    const filteredGroups = activeFilter === 'all' 
      ? sortedGroups 
      : sortedGroups.filter(g => g.id === activeFilter);
    
    const groupsHtml = filteredGroups.map(group => renderGroup(group)).join('');
    
    grid.innerHTML = `
      ${renderProgressHeader(stats)}
      ${renderFilters(sortedGroups)}
      <div class="char-content">
        ${groupsHtml || '<p class="char-empty">No characters found.</p>'}
      </div>
    `;
  }

  function handleClick(e){
    const filterBtn = e.target.closest('.char-filter');
    if(filterBtn){
      const filterId = filterBtn.dataset.filter;
      if(filterId){
        activeFilter = filterId;
        render();
      }
      return;
    }

    const audioBtn = e.target.closest('.char-card__audio');
    if(audioBtn){
      const audioPath = audioBtn.dataset.audio;
      if(audioPath){
        const audio = new Audio(audioPath);
        audio.play().catch(err => console.warn('Failed to play audio:', err));
      }
      return;
    }

    const practiceBtn = e.target.closest('.char-card__practice');
    if(practiceBtn){
      const charValue = practiceBtn.dataset.char;
      const card = practiceBtn.closest('.char-card');
      const charId = card ? card.dataset.charId : '';
      
      if(typeof window.LessonSimulator !== 'undefined' && window.LessonSimulator.open){
        const defaultExercises = ['listening', 'match-pairs'];
        window.LessonSimulator.open({
          lessonTitle: `Practice ${charValue}`,
          lessonNumberText: 'Character Practice',
          sectionTitle: 'Characters',
          unitTitle: '',
          lessonDetail: null,
          lessonMeta: { lessonId: charId, skillId: 'characters', levelId: '' },
          selectedExercises: defaultExercises,
          trigger: practiceBtn
        });
      }
      return;
    }
  }

  container.addEventListener('click', handleClick);

  const isCharactersView = () => {
    const hash = location.hash || '';
    return hash === '#/characters' || hash === '#characters';
  };

  if(isCharactersView()){
    render();
  }

  window.addEventListener('hashchange', () => {
    if(isCharactersView()){
      render();
    }
  });
})();
