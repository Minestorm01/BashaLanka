(function(){
  const container = document.getElementById('view-quests');
  if(!container) return;

  const questsList = container.querySelector('#questsList');
  if(!questsList) return;

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  function getTodayKey(){
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  function getQuestProgress(questId){
    try{
      const key = `quest-${questId}-${getTodayKey()}`;
      const stored = localStorage.getItem(key);
      return stored ? parseFloat(stored) : 0;
    }catch{
      return 0;
    }
  }

  function setQuestProgress(questId, progress){
    try{
      const key = `quest-${questId}-${getTodayKey()}`;
      localStorage.setItem(key, String(progress));
    }catch(err){
      console.warn('Failed to save quest progress:', err);
    }
  }

  const dailyQuests = [
    {
      id: 'daily_warmup',
      title: 'Daily Warm-up',
      description: 'Complete 1 lesson today',
      type: 'daily',
      goal: 1,
      reward: '10 XP',
      icon: '☀️'
    },
    {
      id: 'daily_streak',
      title: 'Keep the Streak',
      description: 'Practice for 3 days in a row',
      type: 'daily',
      goal: 3,
      reward: '30 XP + Streak Badge',
      icon: '🔥'
    },
    {
      id: 'daily_perfect',
      title: 'Perfect Practice',
      description: 'Get 100% on any lesson',
      type: 'daily',
      goal: 1,
      reward: '15 XP',
      icon: '⭐'
    }
  ];

  const weeklyQuests = [
    {
      id: 'weekly_dedicated',
      title: 'Dedicated Learner',
      description: 'Complete 10 lessons this week',
      type: 'weekly',
      goal: 10,
      reward: '100 XP',
      icon: '📚'
    },
    {
      id: 'weekly_characters',
      title: 'Character Master',
      description: 'Practice 20 characters',
      type: 'weekly',
      goal: 20,
      reward: '80 XP + Script Badge',
      icon: 'අ'
    },
    {
      id: 'weekly_conversation',
      title: 'Conversation Practice',
      description: 'Complete 5 dialogue exercises',
      type: 'weekly',
      goal: 5,
      reward: '60 XP',
      icon: '💬'
    }
  ];

  function renderQuest(quest){
    const progress = getQuestProgress(quest.id);
    const progressPercent = Math.min(100, Math.round((progress / quest.goal) * 100));
    const isComplete = progress >= quest.goal;
    const statusClass = isComplete ? 'quest--complete' : progressPercent > 0 ? 'quest--in-progress' : 'quest--new';
    
    return `
      <div class="quest-card ${statusClass}" data-quest-id="${escapeHtml(quest.id)}">
        <div class="quest-card__icon">${quest.icon}</div>
        <div class="quest-card__content">
          <div class="quest-card__header">
            <h3 class="quest-card__title">${escapeHtml(quest.title)}</h3>
            <span class="quest-card__badge">${escapeHtml(quest.type)}</span>
          </div>
          <p class="quest-card__description">${escapeHtml(quest.description)}</p>
          <div class="quest-card__progress">
            <div class="quest-card__progress-bar">
              <div class="quest-card__progress-fill" style="width: ${progressPercent}%"></div>
            </div>
            <span class="quest-card__progress-text">${Math.floor(progress)} / ${quest.goal}</span>
          </div>
          <div class="quest-card__footer">
            <span class="quest-card__reward">Reward: ${escapeHtml(quest.reward)}</span>
            ${isComplete ? '<span class="quest-card__complete-badge">✓ Complete!</span>' : ''}
          </div>
        </div>
      </div>
    `;
  }

  function render(){
    const allQuests = [...dailyQuests, ...weeklyQuests];
    const questsHtml = allQuests.map(quest => renderQuest(quest)).join('');

    const content = `
      <div class="quests-header">
        <div class="quests-summary">
          <div class="quest-stat">
            <span class="quest-stat__icon">🎯</span>
            <div class="quest-stat__info">
              <strong>${dailyQuests.filter(q => getQuestProgress(q.id) >= q.goal).length} / ${dailyQuests.length}</strong>
              <small>Daily quests</small>
            </div>
          </div>
          <div class="quest-stat">
            <span class="quest-stat__icon">📅</span>
            <div class="quest-stat__info">
              <strong>${weeklyQuests.filter(q => getQuestProgress(q.id) >= q.goal).length} / ${weeklyQuests.length}</strong>
              <small>Weekly quests</small>
            </div>
          </div>
        </div>
      </div>
      
      <div class="quests-section">
        <h2 class="quests-section__title">Daily Quests</h2>
        <p class="quests-section__subtitle">Reset daily at midnight</p>
        ${dailyQuests.map(quest => renderQuest(quest)).join('')}
      </div>

      <div class="quests-section">
        <h2 class="quests-section__title">Weekly Quests</h2>
        <p class="quests-section__subtitle">Reset every Monday</p>
        ${weeklyQuests.map(quest => renderQuest(quest)).join('')}
      </div>
    `;

    questsList.innerHTML = content;
  }

  function handleClick(e){
    const questCard = e.target.closest('.quest-card');
    if(questCard){
      const questId = questCard.dataset.questId;
      if(questId){
        console.log('Quest clicked:', questId);
      }
    }
  }

  container.addEventListener('click', handleClick);

  const isQuestsView = () => {
    const hash = location.hash || '';
    return hash === '#/quests' || hash === '#quests';
  };

  if(isQuestsView()){
    render();
  }

  window.addEventListener('hashchange', () => {
    if(isQuestsView()){
      render();
    }
  });
})();
