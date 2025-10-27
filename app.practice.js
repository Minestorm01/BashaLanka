(function(){
  const container = document.getElementById('view-practice');
  if(!container) return;

  const escapeHtml = (text) => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  };

  function getCompletedLessons(){
    try{
      const stored = localStorage.getItem('bashalanka-progress');
      if(!stored) return [];
      const progress = JSON.parse(stored);
      const completed = [];
      
      Object.keys(progress).forEach(key => {
        const item = progress[key];
        if(item && item.status === 'completed'){
          completed.push({
            id: key,
            title: item.title || `Lesson ${key}`,
            section: item.section || '',
            unit: item.unit || ''
          });
        }
      });
      
      return completed;
    }catch{
      return [];
    }
  }

  const exerciseTypes = [
    { id: 'match-pairs', label: 'Match Pairs', description: 'Match Sinhala and English' },
    { id: 'translate-to-base', label: 'Translate to English', description: 'Translate from Sinhala' },
    { id: 'translate-to-target', label: 'Translate to Sinhala', description: 'Translate from English' },
    { id: 'listening', label: 'Listening', description: 'Listen and identify' },
    { id: 'picture-choice', label: 'Picture Choice', description: 'Match images with words' },
    { id: 'fill-blank', label: 'Fill in the Blank', description: 'Complete sentences' }
  ];

  function render(){
    const completedLessons = getCompletedLessons();
    const hasCompletedLessons = completedLessons.length > 0;

    const exerciseCheckboxes = exerciseTypes.map(ex => `
      <label class="practice-option">
        <input type="checkbox" name="exercise" value="${escapeHtml(ex.id)}" ${ex.id === 'match-pairs' || ex.id === 'translate-to-base' ? 'checked' : ''}>
        <span class="practice-option__label">
          <strong>${escapeHtml(ex.label)}</strong>
          <small>${escapeHtml(ex.description)}</small>
        </span>
      </label>
    `).join('');

    const lessonOptions = hasCompletedLessons
      ? completedLessons.slice(0, 20).map(lesson => `
          <option value="${escapeHtml(lesson.id)}">${escapeHtml(lesson.title)}</option>
        `).join('')
      : '<option value="" disabled>No completed lessons yet</option>';

    container.innerHTML = `
      <h1 id="practice-title" class="section-title">Practice</h1>
      <p class="muted">Create custom practice sessions from completed lessons.</p>
      
      <div class="practice-config">
        <div class="card">
          <h2 class="card__title">Practice Session Setup</h2>
          
          <form id="practiceForm" class="practice-form">
            <div class="practice-form__section">
              <label for="practiceMode" class="practice-label">Practice Mode</label>
              <select id="practiceMode" class="select" name="mode">
                <option value="recent">Recent mistakes</option>
                <option value="weakest">Weakest skills</option>
                <option value="random" selected>Random review</option>
                <option value="specific">Specific lesson</option>
              </select>
            </div>

            <div class="practice-form__section" id="lessonSelectSection" hidden>
              <label for="specificLesson" class="practice-label">Choose Lesson</label>
              <select id="specificLesson" class="select" name="lesson">
                ${lessonOptions}
              </select>
            </div>

            <div class="practice-form__section">
              <label class="practice-label">Exercise Types</label>
              <div class="practice-options">
                ${exerciseCheckboxes}
              </div>
            </div>

            <div class="practice-form__section">
              <label for="duration" class="practice-label">Session Length</label>
              <select id="duration" class="select" name="duration">
                <option value="5">5 exercises (Quick)</option>
                <option value="10" selected>10 exercises (Standard)</option>
                <option value="15">15 exercises (Extended)</option>
                <option value="20">20 exercises (Marathon)</option>
              </select>
            </div>

            <button type="submit" class="btn btn--primary btn--lg" id="startPracticeBtn" ${!hasCompletedLessons ? 'disabled' : ''}>
              Start Practice Session
            </button>
            
            ${!hasCompletedLessons ? '<p class="practice-hint">Complete some lessons first to unlock practice sessions!</p>' : ''}
          </form>
        </div>

        <div class="practice-stats card">
          <h3 class="card__title">Practice Stats</h3>
          <ul class="stats">
            <li><strong>0</strong> practice sessions</li>
            <li><strong>0</strong> exercises completed</li>
            <li><strong>0%</strong> average accuracy</li>
          </ul>
        </div>
      </div>
    `;

    const form = container.querySelector('#practiceForm');
    const modeSelect = container.querySelector('#practiceMode');
    const lessonSection = container.querySelector('#lessonSelectSection');

    if(modeSelect && lessonSection){
      modeSelect.addEventListener('change', (e) => {
        lessonSection.hidden = e.target.value !== 'specific';
      });
    }

    if(form){
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleStartPractice(new FormData(form));
      });
    }
  }

  function handleStartPractice(formData){
    const mode = formData.get('mode');
    const duration = parseInt(formData.get('duration')) || 10;
    const selectedExercises = formData.getAll('exercise');
    
    if(selectedExercises.length === 0){
      alert('Please select at least one exercise type.');
      return;
    }

    if(typeof window.LessonSimulator !== 'undefined' && window.LessonSimulator.open){
      window.LessonSimulator.open({
        lessonTitle: 'Practice Session',
        lessonNumberText: `${duration} exercises`,
        sectionTitle: 'Practice',
        unitTitle: mode,
        lessonDetail: null,
        lessonMeta: { lessonId: 'practice', skillId: mode, levelId: '' },
        selectedExercises: selectedExercises,
        trigger: null
      });
    }
  }

  const isPracticeView = () => {
    const hash = location.hash || '';
    return hash === '#/practice' || hash === '#practice';
  };

  if(isPracticeView()){
    render();
  }

  window.addEventListener('hashchange', () => {
    if(isPracticeView()){
      render();
    }
  });
})();
