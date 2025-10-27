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
  let currentAudio = null;

  // ============================================
  // DUOLINGO-STYLE MASTERY TRACKING
  // ============================================
  
  // Strength-based system (0-100) with proper spaced repetition
  // Inspired by Duolingo's Half-Life Regression algorithm
  
  function getProgress(charId){
    try{
      const key = `char-progress-${charId}`;
      const stored = localStorage.getItem(key);
      
      // Default values for all fields
      const defaults = { 
        status: 'new', 
        strength: 0,           // 0-100 strength points (replaces score)
        attempts: 0, 
        correct: 0,
        consecutiveCorrect: 0, // Track streak for mastery
        lastPracticed: null,
        tracingAttempts: 0,
        listeningAttempts: 0
      };
      
      if(!stored) return defaults;
      
      const data = JSON.parse(stored);
      
      // Migrate old format: score (0-1) → strength (0-100)
      if(data.score !== undefined && data.strength === undefined){
        data.strength = Math.round((data.score || 0) * 100);
        delete data.score;
      }
      if(data.mastery !== undefined && data.strength === undefined){
        data.strength = Math.round((data.mastery || 0) * 100);
        delete data.mastery;
      }
      
      // Ensure all fields exist with defaults (critical for legacy data)
      const migrated = { ...defaults, ...data };
      
      // Coerce numeric fields to prevent NaN corruption
      migrated.strength = Number(migrated.strength) || 0;
      migrated.attempts = Number(migrated.attempts) || 0;
      migrated.correct = Number(migrated.correct) || 0;
      migrated.consecutiveCorrect = Number(migrated.consecutiveCorrect) || 0;
      migrated.tracingAttempts = Number(migrated.tracingAttempts) || 0;
      migrated.listeningAttempts = Number(migrated.listeningAttempts) || 0;
      
      // Clamp strength to valid range [0, 100]
      migrated.strength = Math.max(0, Math.min(100, migrated.strength));
      
      // Auto-derive status based on strength thresholds
      if(!migrated.status || migrated.status === 'undefined'){
        migrated.status = calculateStatus(migrated.strength);
      }
      
      return migrated;
    }catch{
      return { status: 'new', strength: 0, attempts: 0, correct: 0, consecutiveCorrect: 0, lastPracticed: null, tracingAttempts: 0, listeningAttempts: 0 };
    }
  }

  function calculateStatus(strength){
    // Duolingo-style thresholds:
    // 90+ = mastered (high confidence)
    // 40-89 = learning (building familiarity)
    // 0-39 = new (needs practice)
    if(strength >= 90) return 'mastered';
    if(strength >= 40) return 'learning';
    return 'new';
  }

  function saveProgress(charId, updates){
    try{
      const current = getProgress(charId);
      const updated = { ...current, ...updates, lastPracticed: Date.now() };
      
      // Coerce numeric fields and prevent NaN corruption
      updated.strength = Number(updated.strength) || 0;
      updated.attempts = Number(updated.attempts) || 0;
      updated.correct = Number(updated.correct) || 0;
      updated.consecutiveCorrect = Number(updated.consecutiveCorrect) || 0;
      updated.tracingAttempts = Number(updated.tracingAttempts) || 0;
      updated.listeningAttempts = Number(updated.listeningAttempts) || 0;
      
      // Clamp strength to valid range [0, 100]
      updated.strength = Math.max(0, Math.min(100, updated.strength));
      
      // Auto-update status based on strength
      updated.status = calculateStatus(updated.strength);
      
      const key = `char-progress-${charId}`;
      localStorage.setItem(key, JSON.stringify(updated));
      return updated;
    }catch(err){
      console.error('Failed to save progress:', err);
      return null;
    }
  }

  function updateScore(charId, isCorrect){
    // Duolingo-style strength system:
    // Correct answer: +15 strength (more if on a streak)
    // Wrong answer: -10 strength (breaks streak)
    // Requires multiple successes to reach mastered (90+)
    
    const progress = getProgress(charId);
    const newAttempts = progress.attempts + 1;
    const newCorrect = progress.correct + (isCorrect ? 1 : 0);
    
    let strengthChange = 0;
    let newConsecutiveCorrect = progress.consecutiveCorrect || 0;
    
    if(isCorrect){
      // Correct answer: award strength points
      newConsecutiveCorrect += 1;
      
      // Bonus for consecutive correct answers (streak multiplier)
      // Bonus kicks in AFTER 3 correct (i.e., on 4th and beyond)
      if(newConsecutiveCorrect > 3){
        strengthChange = 20; // Bigger boost for consistency
      }else{
        strengthChange = 15; // Standard boost
      }
    }else{
      // Wrong answer: lose strength and break streak
      strengthChange = -10;
      newConsecutiveCorrect = 0;
    }
    
    const newStrength = progress.strength + strengthChange;
    
    return saveProgress(charId, {
      attempts: newAttempts,
      correct: newCorrect,
      strength: newStrength,
      consecutiveCorrect: newConsecutiveCorrect
    });
  }

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

  // ============================================
  // CHARACTER CARD RENDERING
  // ============================================

  function renderCharacterCard(char, groupId){
    const charId = `${groupId}-${char.si}`;
    const progress = getProgress(charId);
    const strength = progress.strength || 0;
    const strengthPercent = Math.round(strength);
    const statusClass = progress.status || 'new';
    
    const audioPath = char.audio ? resolveAsset(`assets/Sinhala_Audio/${char.audio}`) : '';
    const playButton = audioPath 
      ? `<button type="button" class="char-card__audio" data-audio="${escapeHtml(audioPath)}" aria-label="Play pronunciation" title="Play pronunciation">🔊</button>`
      : '';

    // Store JSON properly - don't escape it in data attribute
    const charDataJson = JSON.stringify(char).replace(/'/g, '&apos;');
    
    return `
      <div class="char-card char-card--${statusClass}" data-char-id="${escapeHtml(charId)}" data-char-data='${charDataJson}' data-group-id="${escapeHtml(groupId)}">
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
              <div class="char-card__progress-fill" style="width: ${strengthPercent}%"></div>
            </div>
            <span class="char-card__progress-text">${strengthPercent}% mastered</span>
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
        const status = progress.status || 'new';
        total++;
        if(status === 'mastered') mastered++;
        else if(status === 'learning') learning++;
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

  // ============================================
  // INTERACTIVE CHARACTER MODAL
  // ============================================

  function createCharacterModal(char, charId, groupId){
    const progress = getProgress(charId);
    const audioPath = char.audio ? resolveAsset(`assets/Sinhala_Audio/${char.audio}`) : '';
    
    const modalHtml = `
      <div class="char-modal-overlay" id="charModal">
        <div class="char-modal" role="dialog" aria-labelledby="charModalTitle" aria-modal="true">
          <div class="char-modal__header">
            <h2 id="charModalTitle" class="char-modal__title">
              <span class="char-modal__char">${escapeHtml(char.si)}</span>
              <span class="char-modal__roman">${escapeHtml(char.roman || '')}</span>
            </h2>
            <button type="button" class="char-modal__close" aria-label="Close modal">&times;</button>
          </div>
          
          <div class="char-modal__tabs">
            <button type="button" class="char-modal__tab active" data-tab="overview">Overview</button>
            <button type="button" class="char-modal__tab" data-tab="trace">Trace</button>
            <button type="button" class="char-modal__tab" data-tab="practice">Practice</button>
          </div>
          
          <div class="char-modal__body">
            <div class="char-modal__content" data-content="overview">
              <div class="char-modal__info">
                <div class="char-modal__pronunciation">
                  <div class="char-modal__label">Romanization</div>
                  <div class="char-modal__value">${escapeHtml(char.roman || 'N/A')}</div>
                </div>
                ${char.ipa ? `
                  <div class="char-modal__pronunciation">
                    <div class="char-modal__label">IPA</div>
                    <div class="char-modal__value">${escapeHtml(char.ipa)}</div>
                  </div>
                ` : ''}
                ${char.meaning ? `
                  <div class="char-modal__pronunciation">
                    <div class="char-modal__label">Meaning</div>
                    <div class="char-modal__value">${escapeHtml(char.meaning)}</div>
                  </div>
                ` : ''}
              </div>
              
              ${audioPath ? `
                <div class="char-modal__audio-section">
                  <button type="button" class="btn btn--lg btn--primary char-modal__play" data-audio="${escapeHtml(audioPath)}">
                    🔊 Listen & Repeat
                  </button>
                  <p class="char-modal__audio-hint">Click to hear native pronunciation</p>
                </div>
              ` : ''}
              
              <div class="char-modal__stats">
                <div class="char-modal__stat">
                  <div class="char-modal__stat-label">Status</div>
                  <div class="char-modal__stat-value char-modal__stat-value--${progress.status}">${progress.status}</div>
                </div>
                <div class="char-modal__stat">
                  <div class="char-modal__stat-label">Strength</div>
                  <div class="char-modal__stat-value">${Math.round(progress.strength || 0)}%</div>
                </div>
                <div class="char-modal__stat">
                  <div class="char-modal__stat-label">Streak</div>
                  <div class="char-modal__stat-value">${progress.consecutiveCorrect || 0}</div>
                </div>
              </div>
            </div>
            
            <div class="char-modal__content" data-content="trace" hidden>
              <div class="char-modal__trace-section">
                <div class="char-modal__trace-display">
                  <div class="char-modal__trace-char">${escapeHtml(char.si)}</div>
                </div>
                <div class="char-modal__canvas-container" style="position: relative; width: 300px; height: 300px;">
                  <canvas id="guideCanvas" class="char-modal__canvas-guide" width="300" height="300" style="position: absolute; top: 0; left: 0; pointer-events: none;"></canvas>
                  <canvas id="tracingCanvas" class="char-modal__canvas" width="300" height="300" style="position: absolute; top: 0; left: 0;"></canvas>
                </div>
                <div class="char-modal__trace-controls">
                  <button type="button" class="btn btn--secondary char-modal__trace-clear">Clear</button>
                  <button type="button" class="btn btn--primary char-modal__trace-check">Check</button>
                </div>
                <div id="traceResult" class="char-modal__trace-result" role="status" aria-live="polite"></div>
              </div>
            </div>
            
            <div class="char-modal__content" data-content="practice" hidden>
              <div class="char-modal__practice-section">
                <h3 class="char-modal__practice-title">Mini Exercises</h3>
                <div class="char-modal__practice-buttons">
                  <button type="button" class="btn btn--secondary char-modal__exercise" data-exercise="matching">
                    🎯 Matching Game
                  </button>
                  <button type="button" class="btn btn--secondary char-modal__exercise" data-exercise="multiple-choice">
                    ✓ Multiple Choice
                  </button>
                  <button type="button" class="btn btn--secondary char-modal__exercise" data-exercise="listening">
                    🔊 Listening Quiz
                  </button>
                </div>
                <div id="exerciseArea" class="char-modal__exercise-area"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    const modalContainer = document.createElement('div');
    modalContainer.innerHTML = modalHtml;
    document.body.appendChild(modalContainer.firstElementChild);
    
    const modal = document.getElementById('charModal');
    initModalHandlers(modal, char, charId, groupId);
    
    // Focus trap
    const focusableElements = modal.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    if(focusableElements.length > 0) focusableElements[0].focus();
  }

  function initModalHandlers(modal, char, charId, groupId){
    const closeBtn = modal.querySelector('.char-modal__close');
    const tabs = modal.querySelectorAll('.char-modal__tab');
    const contents = modal.querySelectorAll('.char-modal__content');
    const playBtn = modal.querySelector('.char-modal__play');
    
    // Close handlers
    const closeModal = () => {
      modal.remove();
      if(currentAudio){
        currentAudio.pause();
        currentAudio = null;
      }
    };
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if(e.target === modal) closeModal();
    });
    
    document.addEventListener('keydown', function escapeHandler(e){
      if(e.key === 'Escape'){
        closeModal();
        document.removeEventListener('keydown', escapeHandler);
      }
    });
    
    // Tab switching
    console.log(`[Modal] Setting up ${tabs.length} tabs`);
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;
        console.log(`[Modal] Tab clicked: ${tabName}`);
        
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        contents.forEach(c => {
          if(c.dataset.content === tabName){
            c.hidden = false;
            if(tabName === 'trace') initTracingCanvas(modal, char, charId);
          }else{
            c.hidden = true;
          }
        });
      });
    });
    
    // Audio playback
    if(playBtn){
      playBtn.addEventListener('click', () => {
        const audioPath = playBtn.dataset.audio;
        if(audioPath){
          if(currentAudio) currentAudio.pause();
          currentAudio = new Audio(audioPath);
          currentAudio.play().catch(err => console.warn('Failed to play audio:', err));
        }
      });
    }
    
    // Exercise buttons
    const exerciseButtons = modal.querySelectorAll('.char-modal__exercise');
    exerciseButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const exerciseType = btn.dataset.exercise;
        initExercise(modal, char, charId, groupId, exerciseType);
      });
    });
  }

  // ============================================
  // TRACING CANVAS
  // ============================================

  // ============================================
  // TRACING VALIDATION (Overlay-based)
  // ============================================
  
  function createReferenceCanvas(char, width, height){
    // Create a hidden canvas with the reference character rendered
    const refCanvas = document.createElement('canvas');
    refCanvas.width = width;
    refCanvas.height = height;
    const refCtx = refCanvas.getContext('2d');
    
    // Draw the character in the center with proper sizing
    refCtx.font = `bold ${Math.floor(height * 0.7)}px Noto Sans Sinhala, sans-serif`;
    refCtx.textAlign = 'center';
    refCtx.textBaseline = 'middle';
    refCtx.fillStyle = '#000';
    refCtx.fillText(char, width / 2, height / 2);
    
    return refCanvas;
  }
  
  function getPixelMap(canvas){
    // Get all non-transparent pixels from a canvas
    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = new Set();
    
    for(let i = 0; i < imageData.data.length; i += 4){
      const alpha = imageData.data[i + 3];
      if(alpha > 30){ // Threshold for "drawn" pixels
        const pixelIndex = Math.floor(i / 4);
        const x = pixelIndex % canvas.width;
        const y = Math.floor(pixelIndex / canvas.width);
        pixels.add(`${x},${y}`);
      }
    }
    
    return pixels;
  }
  
  function getPixelsNearReference(refPixels, toleranceRadius){
    // Get all pixels within tolerance zone of reference pixels
    const nearPixels = new Set();
    
    for(const pixelStr of refPixels){
      const [x, y] = pixelStr.split(',').map(Number);
      
      // Add pixels in a square around each reference pixel
      for(let dx = -toleranceRadius; dx <= toleranceRadius; dx++){
        for(let dy = -toleranceRadius; dy <= toleranceRadius; dy++){
          nearPixels.add(`${x + dx},${y + dy}`);
        }
      }
    }
    
    return nearPixels;
  }
  
  function validateTracing(strokes, canvas, referenceCanvas){
    // Overlay-based validation: compare user drawing to reference character
    
    if(!strokes || strokes.length === 0){
      console.log('[Tracing] ❌ No strokes drawn');
      return { isValid: false, feedback: 'Draw something first!' };
    }
    
    // Get pixel maps
    const refPixels = getPixelMap(referenceCanvas);
    const userPixels = getPixelMap(canvas);
    
    console.log(`[Tracing] Reference pixels: ${refPixels.size}, User pixels: ${userPixels.size}`);
    
    // Check if user drew anything substantial
    if(userPixels.size < 20){
      console.log('[Tracing] ❌ Not enough drawing');
      return { isValid: false, feedback: 'Draw more!' };
    }
    
    // Tolerance zones:
    // - perfectZone: pixels exactly on the character (0px tolerance)
    // - goodZone: pixels just outside (8px tolerance) 
    // - farZone: pixels way off (beyond 8px)
    
    const CLOSE_TOLERANCE = 8; // pixels
    const goodZone = getPixelsNearReference(refPixels, CLOSE_TOLERANCE);
    
    let pixelsOnTarget = 0;
    let pixelsNearTarget = 0;
    let pixelsWayOff = 0;
    
    for(const userPixel of userPixels){
      if(refPixels.has(userPixel)){
        pixelsOnTarget++;
      } else if(goodZone.has(userPixel)){
        pixelsNearTarget++;
      } else {
        pixelsWayOff++;
      }
    }
    
    const totalGoodPixels = pixelsOnTarget + pixelsNearTarget;
    const matchRatio = totalGoodPixels / userPixels.size;
    const coverageRatio = totalGoodPixels / refPixels.size;
    
    console.log(`[Tracing] On target: ${pixelsOnTarget}, Near: ${pixelsNearTarget}, Way off: ${pixelsWayOff}`);
    console.log(`[Tracing] Match ratio: ${(matchRatio * 100).toFixed(1)}%, Coverage: ${(coverageRatio * 100).toFixed(1)}%`);
    
    // Validation thresholds:
    // - At least 60% of user's drawing should be on/near the character
    // - User should cover at least 35% of the reference character
    const MIN_MATCH_RATIO = 0.60;
    const MIN_COVERAGE_RATIO = 0.35;
    
    if(matchRatio < MIN_MATCH_RATIO){
      console.log(`[Tracing] ❌ Failed: Too many pixels way off target`);
      return { isValid: false, feedback: 'Follow the character outline more closely!' };
    }
    
    if(coverageRatio < MIN_COVERAGE_RATIO){
      console.log(`[Tracing] ❌ Failed: Not enough coverage of the character`);
      return { isValid: false, feedback: 'Draw more of the character!' };
    }
    
    console.log('[Tracing] ✅ PASSED! Drawing matches the character!');
    return { isValid: true, feedback: '' };
  }

  function initTracingCanvas(modal, char, charId){
    const canvas = modal.querySelector('#tracingCanvas');
    const guideCanvas = modal.querySelector('#guideCanvas');
    if(!canvas || canvas.dataset.initialized) return;
    
    canvas.dataset.initialized = 'true';
    const ctx = canvas.getContext('2d');
    const guideCtx = guideCanvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Create reference canvas with the character outline
    const referenceCanvas = createReferenceCanvas(char.si, canvas.width, canvas.height);
    
    // Draw semi-transparent character outline on the GUIDE canvas (separate layer)
    guideCtx.save();
    guideCtx.globalAlpha = 0.25; // Subtle but visible guide
    guideCtx.drawImage(referenceCanvas, 0, 0);
    guideCtx.restore();
    
    let isDrawing = false;
    let strokes = [];
    let currentStroke = [];
    
    ctx.lineWidth = 8; // Thicker line for better coverage
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#4a9eff';
    
    const startDrawing = (e) => {
      isDrawing = true;
      const pos = getPosition(e);
      currentStroke = [pos];
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };
    
    const draw = (e) => {
      if(!isDrawing) return;
      const pos = getPosition(e);
      currentStroke.push(pos);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };
    
    const stopDrawing = () => {
      if(isDrawing && currentStroke.length > 0){
        strokes.push([...currentStroke]);
        currentStroke = [];
      }
      isDrawing = false;
    };
    
    const getPosition = (e) => {
      const rect = canvas.getBoundingClientRect();
      const clientX = e.clientX || (e.touches && e.touches[0].clientX);
      const clientY = e.clientY || (e.touches && e.touches[0].clientY);
      return {
        x: clientX - rect.left,
        y: clientY - rect.top
      };
    };
    
    canvas.addEventListener('mousedown', startDrawing);
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', stopDrawing);
    canvas.addEventListener('mouseleave', stopDrawing);
    
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startDrawing(e);
    });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      draw(e);
    });
    canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      stopDrawing();
    });
    
    const clearBtn = modal.querySelector('.char-modal__trace-clear');
    const checkBtn = modal.querySelector('.char-modal__trace-check');
    const resultDiv = modal.querySelector('#traceResult');
    
    clearBtn.addEventListener('click', () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // Guide canvas remains unchanged - it's on a separate layer
      strokes = [];
      currentStroke = [];
      resultDiv.textContent = '';
      resultDiv.className = 'char-modal__trace-result';
    });
    
    checkBtn.addEventListener('click', () => {
      if(strokes.length === 0){
        resultDiv.textContent = 'Draw the character first!';
        resultDiv.className = 'char-modal__trace-result char-modal__trace-result--warning';
        return;
      }
      
      // Overlay-based validation (compares pixels to reference character)
      const validation = validateTracing(strokes, canvas, referenceCanvas);
      
      const progress = getProgress(charId);
      const newTracingAttempts = (progress.tracingAttempts || 0) + 1;
      
      if(validation.isValid){
        resultDiv.textContent = '✓ Great job! Keep practicing!';
        resultDiv.className = 'char-modal__trace-result char-modal__trace-result--success';
        
        // Award progress for correct tracing
        const newProgress = updateScore(charId, true);
        saveProgress(charId, { ...newProgress, tracingAttempts: newTracingAttempts });
        
        // Update UI
        setTimeout(() => {
          render();
        }, 1000);
      }else{
        resultDiv.textContent = `${validation.feedback} Try again!`;
        resultDiv.className = 'char-modal__trace-result char-modal__trace-result--error';
        
        // Record failed attempt (loses strength)
        const newProgress = updateScore(charId, false);
        saveProgress(charId, { ...newProgress, tracingAttempts: newTracingAttempts });
        
        // Update UI after delay
        setTimeout(() => {
          render();
        }, 1500);
      }
    });
  }

  // ============================================
  // MINI EXERCISES
  // ============================================

  function initExercise(modal, char, charId, groupId, exerciseType){
    const exerciseArea = modal.querySelector('#exerciseArea');
    
    if(exerciseType === 'matching'){
      renderMatchingExercise(exerciseArea, char, charId, groupId);
    }else if(exerciseType === 'multiple-choice'){
      renderMultipleChoiceExercise(exerciseArea, char, charId, groupId);
    }else if(exerciseType === 'listening'){
      renderListeningExercise(exerciseArea, char, charId, groupId);
    }
  }

  function renderMatchingExercise(area, char, charId, groupId){
    // Get other characters from the same group for matching
    const group = charactersData.groups.find(g => g.id === groupId);
    if(!group || !group.characters) return;
    
    const otherChars = group.characters.filter(c => c.si !== char.si).slice(0, 3);
    const allChars = [char, ...otherChars].sort(() => Math.random() - 0.5);
    
    area.innerHTML = `
      <div class="char-exercise">
        <h4 class="char-exercise__title">Match the character to its romanization:</h4>
        <div class="char-exercise__question">${escapeHtml(char.si)}</div>
        <div class="char-exercise__options">
          ${allChars.map(c => `
            <button type="button" class="btn btn--secondary char-exercise__option" data-correct="${c.si === char.si}">
              ${escapeHtml(c.roman || '')}
            </button>
          `).join('')}
        </div>
        <div class="char-exercise__result" role="status" aria-live="polite"></div>
      </div>
    `;
    
    const options = area.querySelectorAll('.char-exercise__option');
    const resultDiv = area.querySelector('.char-exercise__result');
    
    options.forEach(btn => {
      btn.addEventListener('click', () => {
        const isCorrect = btn.dataset.correct === 'true';
        updateScore(charId, isCorrect);
        
        if(isCorrect){
          resultDiv.textContent = '✓ Correct!';
          resultDiv.className = 'char-exercise__result char-exercise__result--success';
          btn.classList.add('correct');
        }else{
          resultDiv.textContent = '✗ Try again';
          resultDiv.className = 'char-exercise__result char-exercise__result--error';
          btn.classList.add('incorrect');
        }
        
        options.forEach(o => o.disabled = true);
        
        setTimeout(() => {
          render();
          area.innerHTML = '<p class="char-exercise__complete">Exercise complete! Try another one.</p>';
        }, 1500);
      });
    });
  }

  function renderMultipleChoiceExercise(area, char, charId, groupId){
    const group = charactersData.groups.find(g => g.id === groupId);
    if(!group || !group.characters) return;
    
    const otherChars = group.characters.filter(c => c.si !== char.si).slice(0, 3);
    const allChars = [char, ...otherChars].sort(() => Math.random() - 0.5);
    
    area.innerHTML = `
      <div class="char-exercise">
        <h4 class="char-exercise__title">Which sound does "${escapeHtml(char.roman || '')}" make?</h4>
        <div class="char-exercise__options">
          ${allChars.map(c => `
            <button type="button" class="btn btn--secondary char-exercise__option char-exercise__option--char" data-correct="${c.si === char.si}">
              ${escapeHtml(c.si)}
            </button>
          `).join('')}
        </div>
        <div class="char-exercise__result" role="status" aria-live="polite"></div>
      </div>
    `;
    
    const options = area.querySelectorAll('.char-exercise__option');
    const resultDiv = area.querySelector('.char-exercise__result');
    
    options.forEach(btn => {
      btn.addEventListener('click', () => {
        const isCorrect = btn.dataset.correct === 'true';
        updateScore(charId, isCorrect);
        
        if(isCorrect){
          resultDiv.textContent = '✓ Correct!';
          resultDiv.className = 'char-exercise__result char-exercise__result--success';
          btn.classList.add('correct');
        }else{
          resultDiv.textContent = '✗ Try again';
          resultDiv.className = 'char-exercise__result char-exercise__result--error';
          btn.classList.add('incorrect');
        }
        
        options.forEach(o => o.disabled = true);
        
        setTimeout(() => {
          render();
          area.innerHTML = '<p class="char-exercise__complete">Exercise complete! Try another one.</p>';
        }, 1500);
      });
    });
  }

  function renderListeningExercise(area, char, charId, groupId){
    const audioPath = char.audio ? resolveAsset(`assets/Sinhala_Audio/${char.audio}`) : '';
    if(!audioPath){
      area.innerHTML = '<p class="char-exercise__error">Audio not available for this character.</p>';
      return;
    }
    
    const group = charactersData.groups.find(g => g.id === groupId);
    if(!group || !group.characters) return;
    
    const otherChars = group.characters.filter(c => c.si !== char.si && c.audio).slice(0, 3);
    const allChars = [char, ...otherChars].sort(() => Math.random() - 0.5);
    
    area.innerHTML = `
      <div class="char-exercise">
        <h4 class="char-exercise__title">Listen and select the correct character:</h4>
        <button type="button" class="btn btn--primary char-exercise__play" data-audio="${escapeHtml(audioPath)}">
          🔊 Play Sound
        </button>
        <div class="char-exercise__options">
          ${allChars.map(c => `
            <button type="button" class="btn btn--secondary char-exercise__option char-exercise__option--char" data-correct="${c.si === char.si}">
              ${escapeHtml(c.si)}
            </button>
          `).join('')}
        </div>
        <div class="char-exercise__result" role="status" aria-live="polite"></div>
      </div>
    `;
    
    const playBtn = area.querySelector('.char-exercise__play');
    const options = area.querySelectorAll('.char-exercise__option');
    const resultDiv = area.querySelector('.char-exercise__result');
    
    playBtn.addEventListener('click', () => {
      if(currentAudio) currentAudio.pause();
      currentAudio = new Audio(audioPath);
      currentAudio.play().catch(err => console.warn('Failed to play audio:', err));
    });
    
    options.forEach(btn => {
      btn.addEventListener('click', () => {
        const isCorrect = btn.dataset.correct === 'true';
        updateScore(charId, isCorrect);
        
        const progress = getProgress(charId);
        const newListeningAttempts = (progress.listeningAttempts || 0) + 1;
        saveProgress(charId, { ...progress, listeningAttempts: newListeningAttempts });
        
        if(isCorrect){
          resultDiv.textContent = '✓ Correct!';
          resultDiv.className = 'char-exercise__result char-exercise__result--success';
          btn.classList.add('correct');
        }else{
          resultDiv.textContent = '✗ Try again';
          resultDiv.className = 'char-exercise__result char-exercise__result--error';
          btn.classList.add('incorrect');
        }
        
        options.forEach(o => o.disabled = true);
        
        setTimeout(() => {
          render();
          area.innerHTML = '<p class="char-exercise__complete">Exercise complete! Try another one.</p>';
        }, 1500);
      });
    });
  }

  // ============================================
  // EVENT HANDLERS
  // ============================================

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
        if(currentAudio) currentAudio.pause();
        currentAudio = new Audio(audioPath);
        currentAudio.play().catch(err => console.warn('Failed to play audio:', err));
      }
      return;
    }

    const practiceBtn = e.target.closest('.char-card__practice');
    if(practiceBtn){
      const card = practiceBtn.closest('.char-card');
      if(!card) return;
      
      const charId = card.dataset.charId;
      const groupId = card.dataset.groupId;
      const charDataStr = card.dataset.charData;
      
      try{
        // Decode the apostrophes back before parsing
        const decodedStr = charDataStr.replace(/&apos;/g, "'");
        const char = JSON.parse(decodedStr);
        createCharacterModal(char, charId, groupId);
      }catch(err){
        console.error('Failed to open character modal:', err);
      }
      return;
    }

    // Click entire card to open modal
    const card = e.target.closest('.char-card');
    if(card){
      const charId = card.dataset.charId;
      const groupId = card.dataset.groupId;
      const charDataStr = card.dataset.charData;
      
      try{
        // Decode the apostrophes back before parsing
        const decodedStr = charDataStr.replace(/&apos;/g, "'");
        const char = JSON.parse(decodedStr);
        createCharacterModal(char, charId, groupId);
      }catch(err){
        console.error('Failed to open character modal:', err);
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
