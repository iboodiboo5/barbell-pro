/* ============================================
   KK BARBELL - Workout Tracker Module
   ============================================ */

const Tracker = {
  data: { weeks: [], currentWeekIndex: -1 },
  currentDayIndex: 0,

  init() {
    this.loadData();
    this.renderWeekTimeline();
    this.renderCurrentWeek();
    this.bindEvents();
  },

  loadData() {
    const saved = Storage.get('barbellPro_workouts');
    if (saved) {
      this.data = saved;
      if (typeof this.data.currentWeekIndex !== 'number') this.data.currentWeekIndex = -1;
    }
  },

  saveData() {
    Storage.set('barbellPro_workouts', this.data);
  },

  bindEvents() {
    // Upload button
    document.getElementById('uploadBtn').addEventListener('click', () => this.openModal());

    // Close modal
    document.getElementById('closeModal').addEventListener('click', () => this.closeModal());
    document.getElementById('uploadModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeModal();
    });

    // Import target toggle
    document.getElementById('importTarget').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      document.querySelectorAll('#importTarget button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });

    // Parse button
    document.getElementById('parseBtn').addEventListener('click', () => this.parseAndPreview());

    // Confirm import
    document.getElementById('confirmImport').addEventListener('click', () => this.confirmImport());

    // Add week
    document.getElementById('addWeekBtn').addEventListener('click', () => this.addNewWeek());

    // Day tabs (delegation)
    document.getElementById('dayTabs').addEventListener('click', e => {
      const tab = e.target.closest('.day-tab');
      if (!tab || tab.classList.contains('delete-mode')) return;
      this.currentDayIndex = parseInt(tab.dataset.index);
      this.renderDayTabs();
      this.renderExercises();
    });

    // Swipe gestures on exercise cards
    this.setupSwipeHandlers();

    // Edit modal
    document.getElementById('closeEditModal').addEventListener('click', () => this.closeEditModal());
    document.getElementById('editModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.closeEditModal();
    });
    document.getElementById('saveEditBtn').addEventListener('click', () => this.saveEditedExercise());

    // Edit mode toggle (Form / Paste)
    document.getElementById('editModeToggle').addEventListener('click', e => {
      const btn = e.target.closest('button');
      if (!btn) return;
      document.querySelectorAll('#editModeToggle button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.getElementById('editFormMode').style.display = mode === 'form' ? '' : 'none';
      document.getElementById('editPasteMode').style.display = mode === 'paste' ? '' : 'none';
    });
  },

  // --- Modal ---
  openModal() {
    document.getElementById('uploadModal').classList.add('active');
    document.getElementById('workoutTextarea').value = '';
    document.getElementById('parsePreview').style.display = 'none';
  },

  closeModal() {
    document.getElementById('uploadModal').classList.remove('active');
  },

  // --- Parser ---
  parseAndPreview() {
    const text = document.getElementById('workoutTextarea').value.trim();
    if (!text) {
      Toast.show('Please paste your workout data');
      return;
    }

    try {
      const days = this.parseWorkoutText(text);
      if (days.length === 0) {
        Toast.show('No workout data found. Check the format.');
        return;
      }

      this._parsedDays = days;
      this.renderPreview(days);
    } catch (err) {
      console.error('Parse error:', err);
      Toast.show('Error parsing workout data');
    }
  },

  parseWorkoutText(text) {
    // Normalize line endings and split
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const days = [];
    let currentDay = null;
    let exerciseBlock = [];

    const flushExercise = () => {
      if (exerciseBlock.length === 0) return;
      const exercise = this.parseExerciseBlock(exerciseBlock);
      if (exercise && currentDay) {
        currentDay.exercises.push(exercise);
      }
      exerciseBlock = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i];
      const line = rawLine.trim();

      // Empty line = exercise separator
      if (line === '') {
        flushExercise();
        continue;
      }

      // Try to detect date line (DD/MM/YYYY or DD/MM/YY)
      const dateResult = this.parseDateLine(line);
      if (dateResult) {
        flushExercise();
        currentDay = {
          id: Utils.generateId(),
          date: dateResult.date,
          dayName: dateResult.dayName,
          exercises: []
        };
        days.push(currentDay);
        continue;
      }

      // Day name only line (Monday, Tuesday, etc.)
      const dayNameResult = this.parseDayNameLine(line);
      if (dayNameResult) {
        if (currentDay && currentDay.exercises.length === 0 && !currentDay.dayName) {
          // Attach day name to the current day that was created from a date line
          currentDay.dayName = dayNameResult;
        } else if (currentDay && !currentDay.dayName) {
          currentDay.dayName = dayNameResult;
        } else {
          // Day name without a preceding date - create a new day
          flushExercise();
          currentDay = {
            id: Utils.generateId(),
            date: '',
            dayName: dayNameResult,
            exercises: []
          };
          days.push(currentDay);
        }
        continue;
      }

      // Skip standalone "Load Sets Reps" header row
      if (/^load\s+sets\s+reps$/i.test(line.replace(/\t+/g, ' ').trim())) {
        continue;
      }

      // Accumulate into exercise block
      exerciseBlock.push(rawLine);
    }

    // Flush last exercise
    flushExercise();

    return days;
  },

  parseDateLine(line) {
    // Combined: "Thursday 25/12/25" or "Friday 26/12/2025"
    const combinedMatch = line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
    if (combinedMatch) {
      return {
        dayName: this.capitalizeDay(combinedMatch[1]),
        date: this.parseDate(combinedMatch[2])
      };
    }

    // Standalone date: "15/12/2025" or "15/12/25"
    const dateOnlyMatch = line.match(/^(\d{1,2}\/\d{1,2}\/\d{2,4})\s*$/);
    if (dateOnlyMatch) {
      return {
        dayName: '',
        date: this.parseDate(dateOnlyMatch[1])
      };
    }

    return null;
  },

  parseDayNameLine(line) {
    const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    // Also handle misspellings like "Wenesday"
    const dayAliases = {
      'monday': 'Monday', 'tuesday': 'Tuesday', 'wednesday': 'Wednesday',
      'wenesday': 'Wednesday', 'thursday': 'Thursday', 'friday': 'Friday',
      'saturday': 'Saturday', 'sunday': 'Sunday'
    };
    const lower = line.toLowerCase().trim();
    if (dayAliases[lower]) return dayAliases[lower];
    // Check if the line starts with a day name and has nothing else meaningful
    for (const day of dayNames) {
      if (lower === day.toLowerCase()) return day;
    }
    return null;
  },

  parseDate(dateStr) {
    // DD/MM/YYYY or DD/MM/YY
    const parts = dateStr.split('/');
    if (parts.length !== 3) return dateStr;
    let [d, m, y] = parts.map(Number);
    if (y < 100) y += 2000;
    const month = String(m).padStart(2, '0');
    const day = String(d).padStart(2, '0');
    return `${y}-${month}-${day}`;
  },

  capitalizeDay(str) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  parseExerciseBlock(lines) {
    if (lines.length === 0) return null;

    // Split each line by tabs
    const parsedLines = lines.map(l => l.split('\t').map(s => s.trim()));

    let name = '';
    let subtitle = '';
    let load = '';
    let sets = '';
    let reps = '';
    let remarks = [];
    let youtubeUrl = null;

    // First line: exercise name (and possibly Load/Sets/Reps headers or data)
    const firstLine = parsedLines[0];
    name = firstLine[0] || '';

    // Check if first line has "Load Sets Reps" as columns 1-3 (exercise header row)
    const hasHeaderRow = firstLine.length >= 4 &&
      /^load$/i.test((firstLine[1] || '').trim()) &&
      /^sets$/i.test((firstLine[2] || '').trim()) &&
      /^reps$/i.test((firstLine[3] || '').trim());

    if (hasHeaderRow) {
      // Next line should have the data (possibly with subtitle)
      if (parsedLines.length >= 2) {
        const dataLine = parsedLines[1];
        // Check if first cell is a subtitle (non-numeric, not empty)
        const firstCell = (dataLine[0] || '').trim();
        if (firstCell && !this.looksLikeLoad(firstCell)) {
          subtitle = firstCell;
          load = (dataLine[1] || '').trim();
          sets = (dataLine[2] || '').trim();
          reps = (dataLine[3] || '').trim();
          remarks = dataLine.slice(4).filter(r => r.trim());
        } else if (firstCell === '' || this.looksLikeLoad(firstCell)) {
          // No subtitle, data starts at first cell
          load = firstCell || (dataLine[1] || '').trim();
          if (firstCell) {
            sets = (dataLine[1] || '').trim();
            reps = (dataLine[2] || '').trim();
            remarks = dataLine.slice(3).filter(r => r.trim());
          } else {
            load = (dataLine[1] || '').trim();
            sets = (dataLine[2] || '').trim();
            reps = (dataLine[3] || '').trim();
            remarks = dataLine.slice(4).filter(r => r.trim());
          }
        }
        // Check remaining lines for youtube URLs or more remarks
        for (let i = 2; i < parsedLines.length; i++) {
          this.extractExtras(parsedLines[i], remarks, r => youtubeUrl = r);
        }
      }
    } else {
      // No header row - check if data is on the same line as the name
      if (firstLine.length >= 4) {
        // Name + Load + Sets + Reps + Remarks on one line
        const maybeLoad = (firstLine[1] || '').trim();
        if (this.looksLikeLoad(maybeLoad) || maybeLoad === '') {
          load = maybeLoad;
          sets = (firstLine[2] || '').trim();
          reps = (firstLine[3] || '').trim();
          remarks = firstLine.slice(4).filter(r => r.trim());
        }
      }

      // Check if there's a second line with more data or a subtitle line
      if (parsedLines.length >= 2) {
        const secondLine = parsedLines[1];
        const firstCell = (secondLine[0] || '').trim();

        // If we didn't get load from first line, try second line
        if (!load && secondLine.length >= 2) {
          if (firstCell && !this.looksLikeLoad(firstCell)) {
            subtitle = firstCell;
            load = (secondLine[1] || '').trim();
            sets = (secondLine[2] || '').trim();
            reps = (secondLine[3] || '').trim();
            remarks = secondLine.slice(4).filter(r => r.trim());
          } else {
            if (firstCell === '') {
              load = (secondLine[1] || '').trim();
              sets = (secondLine[2] || '').trim();
              reps = (secondLine[3] || '').trim();
              remarks = secondLine.slice(4).filter(r => r.trim());
            } else {
              load = firstCell;
              sets = (secondLine[1] || '').trim();
              reps = (secondLine[2] || '').trim();
              remarks = secondLine.slice(3).filter(r => r.trim());
            }
          }
        }

        // Check remaining lines
        for (let i = (load ? 2 : 1); i < parsedLines.length; i++) {
          this.extractExtras(parsedLines[i], remarks, r => youtubeUrl = r);
        }
      }
    }

    // Check for YouTube URL in name or subtitle
    if (!youtubeUrl) {
      const urlCheck = (name + ' ' + subtitle).match(/(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\S+)/);
      if (urlCheck) {
        youtubeUrl = urlCheck[1];
        name = name.replace(urlCheck[1], '').trim();
        subtitle = subtitle.replace(urlCheck[1], '').trim();
      }
    }

    // Detect load unit
    let loadUnit = 'kg';
    if (/lb/i.test(load)) loadUnit = 'lb';
    else if (/p\s*$/i.test(load)) loadUnit = 'plates';

    // Clean up
    if (!name) return null;
    // Filter out empty/whitespace-only remarks
    remarks = remarks.filter(r => r && r.trim().length > 0);

    return {
      id: Utils.generateId(),
      name: name.trim(),
      subtitle: subtitle.trim() || null,
      load: load.trim(),
      loadUnit,
      sets: parseInt(sets) || sets || '',
      reps: reps.trim(),
      remarks,
      youtubeUrl,
      completed: false
    };
  },

  looksLikeLoad(str) {
    if (!str) return false;
    str = str.trim();
    // Matches: numbers, numbers with units (kg, lb, p, m), "Done", empty-ish
    return /^(\d+\.?\d*\s*(kg|lb|p|m|min)?|done|\d+p)$/i.test(str) || str === '';
  },

  extractExtras(lineParts, remarks, setUrl) {
    const joined = lineParts.join(' ').trim();
    if (!joined) return;

    // Check for YouTube URL
    const urlMatch = joined.match(/(https?:\/\/(www\.)?(youtube\.com|youtu\.be)\S+)/);
    if (urlMatch) {
      setUrl(urlMatch[1]);
      const rest = joined.replace(urlMatch[1], '').trim();
      if (rest) remarks.push(rest);
    } else {
      // Add non-empty cells as remarks
      lineParts.forEach(part => {
        if (part.trim()) remarks.push(part.trim());
      });
    }
  },

  // --- Import ---
  _parsedDays: null,

  confirmImport() {
    if (!this._parsedDays || this._parsedDays.length === 0) return;

    const target = document.querySelector('#importTarget button.active').dataset.target;

    if (target === 'new' || this.data.weeks.length === 0) {
      // Create new week
      const weekNum = this.data.weeks.length + 1;
      const newWeek = {
        id: Utils.generateId(),
        weekNumber: weekNum,
        label: 'Week ' + weekNum,
        days: this._parsedDays
      };
      this.data.weeks.push(newWeek);
      this.data.currentWeekIndex = this.data.weeks.length - 1;
    } else {
      // Add to current week
      const week = this.data.weeks[this.data.currentWeekIndex];
      if (!week) {
        Toast.show('No current week selected');
        return;
      }

      // Merge days: if day name matches, append exercises; otherwise add new day
      for (const newDay of this._parsedDays) {
        const existing = week.days.find(d =>
          d.dayName && newDay.dayName && d.dayName.toLowerCase() === newDay.dayName.toLowerCase()
        );
        if (existing) {
          existing.exercises.push(...newDay.exercises);
        } else {
          week.days.push(newDay);
        }
      }
    }

    this.saveData();
    this.closeModal();
    this.currentDayIndex = 0;
    this.renderWeekTimeline();
    this.renderCurrentWeek();

    const exerciseCount = this._parsedDays.reduce((sum, d) => sum + d.exercises.length, 0);
    Toast.show(`Imported ${this._parsedDays.length} day${this._parsedDays.length !== 1 ? 's' : ''}, ${exerciseCount} exercises`);
    this._parsedDays = null;
  },

  addNewWeek() {
    const weekNum = this.data.weeks.length + 1;
    this.data.weeks.push({
      id: Utils.generateId(),
      weekNumber: weekNum,
      label: 'Week ' + weekNum,
      days: []
    });
    this.data.currentWeekIndex = this.data.weeks.length - 1;
    this.currentDayIndex = 0;
    this.saveData();
    this.renderWeekTimeline();
    this.renderCurrentWeek();
    Toast.show('Week ' + weekNum + ' added');
  },

  // --- Preview ---
  renderPreview(days) {
    const preview = document.getElementById('parsePreview');
    const content = document.getElementById('previewContent');
    const count = document.getElementById('previewCount');

    const totalExercises = days.reduce((sum, d) => sum + d.exercises.length, 0);
    count.textContent = `${days.length} day${days.length !== 1 ? 's' : ''}, ${totalExercises} exercises`;

    content.innerHTML = days.map(day => `
      <div class="preview-day">
        <div class="preview-day-header">${Utils.escapeHtml(day.dayName || 'Unknown Day')}${day.date ? ' - ' + day.date : ''}</div>
        ${day.exercises.map(ex => `
          <div class="preview-exercise">
            <span class="preview-exercise-name">${Utils.escapeHtml(ex.name)}</span>
            <span class="preview-exercise-info">${ex.load || '-'} | ${ex.sets}x${ex.reps}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    preview.style.display = 'block';
    preview.scrollIntoView({ behavior: 'smooth' });
  },

  // --- Rendering ---
  renderWeekTimeline() {
    const container = document.getElementById('weekTimeline');
    const addBtn = document.getElementById('addWeekBtn');

    // Remove existing pills (keep add button)
    container.querySelectorAll('.week-pill:not(.add-week)').forEach(el => el.remove());

    this.data.weeks.forEach((week, i) => {
      const pill = document.createElement('button');
      pill.className = 'week-pill' + (i === this.data.currentWeekIndex ? ' active' : '');
      pill.textContent = week.label;
      pill.addEventListener('click', () => {
        if (pill.classList.contains('delete-mode')) return;
        this.data.currentWeekIndex = i;
        this.currentDayIndex = 0;
        this.saveData();
        this.renderWeekTimeline();
        this.renderCurrentWeek();
      });
      // Long-press to delete
      this.attachLongPress(pill, () => this.confirmDeleteWeek(i, pill));
      container.insertBefore(pill, addBtn);
    });

    // Auto-scroll to active pill so newest weeks are visible
    requestAnimationFrame(() => {
      const activePill = container.querySelector('.week-pill.active');
      if (activePill) {
        activePill.scrollIntoView({ inline: 'center', block: 'nearest' });
      }
    });
  },

  renderCurrentWeek() {
    const week = this.data.weeks[this.data.currentWeekIndex];

    if (!week || week.days.length === 0) {
      document.getElementById('dayTabs').innerHTML = '';
      document.getElementById('exerciseList').innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <h3>No Workouts Yet</h3>
          <p>Tap "Upload Workout" to import your training data</p>
        </div>`;
      return;
    }

    if (this.currentDayIndex >= week.days.length) {
      this.currentDayIndex = 0;
    }

    this.renderDayTabs();
    this.renderExercises();
  },

  renderDayTabs() {
    const week = this.data.weeks[this.data.currentWeekIndex];
    if (!week) return;

    const container = document.getElementById('dayTabs');
    container.innerHTML = '';

    week.days.forEach((day, i) => {
      const tab = document.createElement('button');
      tab.className = 'day-tab' + (i === this.currentDayIndex ? ' active' : '');
      tab.dataset.index = i;
      tab.textContent = day.dayName || 'Day ' + (i + 1);
      // Long-press to delete
      this.attachLongPress(tab, () => this.confirmDeleteDay(i, tab));
      container.appendChild(tab);
    });
  },

  isBarbellCompound(name) {
    if (typeof BARBELL_COMPOUNDS === 'undefined' || typeof LIFT_GROUPS === 'undefined') return false;
    const lower = name.toLowerCase().trim();
    // Exclude dumbbell / machine variants
    if (/\b(db|dumbbell|cable|machine)\b/i.test(lower)) return false;
    // Exclude incline DB exercises from matching "bench press"
    if (/incline/i.test(lower) && /\b(db|dumbbell)\b/i.test(name)) return false;
    for (const groupName of BARBELL_COMPOUNDS) {
      const aliases = LIFT_GROUPS[groupName];
      if (aliases && aliases.some(alias => lower.includes(alias))) return true;
    }
    return false;
  },

  renderExercises() {
    const week = this.data.weeks[this.data.currentWeekIndex];
    if (!week) return;

    const day = week.days[this.currentDayIndex];
    if (!day) return;

    const container = document.getElementById('exerciseList');
    if (day.exercises.length === 0) {
      container.innerHTML = '<div class="empty-state"><h3>No exercises</h3><p>Upload workout data to add exercises</p></div>';
      return;
    }

    container.innerHTML = day.exercises.map((ex, i) => {
      // Load display: append "kg" if unit is kg and not already shown
      const loadDisplay = ex.load
        ? `${ex.load}${ex.loadUnit === 'kg' && !/kg/i.test(ex.load) && /^\d/.test(ex.load) ? 'kg' : ''}`
        : '--';
      const setsDisplay = ex.sets || '--';
      const repsDisplay = ex.reps || '--';
      const isCompound = this.isBarbellCompound(ex.name);
      const cardClass = `exercise-card ${ex.completed ? 'completed' : ''} ${isCompound ? 'compound' : 'accessory'}`;

      return `<div class="exercise-card-wrapper" data-exercise-index="${i}">
        <div class="swipe-delete-bg">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete
        </div>
        <div class="${cardClass}" data-id="${ex.id}" data-exercise-index="${i}">
        <div class="exercise-header">
          <div>
            <div class="exercise-name">${Utils.escapeHtml(ex.name)}</div>
            ${ex.subtitle ? `<div class="exercise-subtitle">${Utils.escapeHtml(ex.subtitle)}</div>` : ''}
          </div>
          <div class="exercise-actions">
            <button class="kebab-btn" data-exercise-index="${i}" aria-label="More options">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>
            </button>
            <button class="complete-toggle ${ex.completed ? 'checked' : ''}" data-exercise-index="${i}"></button>
          </div>
        </div>
        <div class="exercise-details">
          <span class="detail-chip load">${Utils.escapeHtml(String(loadDisplay))}</span>
          <span class="detail-chip">${setsDisplay} sets</span>
          <span class="detail-chip">${Utils.escapeHtml(String(repsDisplay))} reps</span>
        </div>
        <div class="exercise-remarks" data-exercise-index="${i}">
          ${(ex.remarks || []).map((r, ri) =>
            `<span class="remark-tag" data-remark-index="${ri}">${Utils.escapeHtml(r)}</span>`
          ).join('')}
          <button class="remark-add-btn" data-exercise-index="${i}" title="Add remark">+</button>
        </div>
        ${ex.youtubeUrl ? `<a class="exercise-link" href="${Utils.escapeHtml(ex.youtubeUrl)}" target="_blank" rel="noopener">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/><polygon fill="white" points="9.545 15.568 15.818 12 9.545 8.432"/></svg>
          Watch Video
        </a>` : ''}
      </div>
      </div>`;
    }).join('');

    // Add "Add Exercise" button at the bottom
    container.innerHTML += `<button class="add-exercise-btn" id="addExerciseBtn">+ Add Exercise</button>`;

    // Bind completion toggles
    container.querySelectorAll('.complete-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.exerciseIndex);
        day.exercises[idx].completed = !day.exercises[idx].completed;
        this.saveData();
        this.renderExercises();
      });
    });

    // Bind add remark buttons
    container.querySelectorAll('.remark-add-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.exerciseIndex);
        this.showRemarkInput(btn, idx);
      });
    });

    // Bind existing remark tags for editing
    container.querySelectorAll('.remark-tag').forEach(tag => {
      tag.addEventListener('click', e => {
        e.stopPropagation();
        const exIdx = parseInt(tag.closest('.exercise-remarks').dataset.exerciseIndex);
        const remarkIdx = parseInt(tag.dataset.remarkIndex);
        this.editRemark(tag, exIdx, remarkIdx);
      });
    });

    // Bind kebab menu buttons
    container.querySelectorAll('.kebab-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.exerciseIndex);
        this.showKebabMenu(btn, idx);
      });
    });

    // Bind add exercise button
    const addBtn = document.getElementById('addExerciseBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => this.openEditModal(-1));
    }
  },

  showRemarkInput(triggerBtn, exerciseIndex) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'remark-input';
    input.placeholder = 'Add remark...';
    input.maxLength = 150;

    triggerBtn.style.display = 'none';
    triggerBtn.parentElement.appendChild(input);
    input.focus();

    const commit = () => {
      const val = input.value.trim();
      if (val) {
        const week = this.data.weeks[this.data.currentWeekIndex];
        const day = week.days[this.currentDayIndex];
        if (!day.exercises[exerciseIndex].remarks) {
          day.exercises[exerciseIndex].remarks = [];
        }
        day.exercises[exerciseIndex].remarks.push(val);
        this.saveData();
      }
      this.renderExercises();
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') this.renderExercises();
    });
    input.addEventListener('blur', commit);
  },

  editRemark(tagEl, exerciseIndex, remarkIndex) {
    const week = this.data.weeks[this.data.currentWeekIndex];
    const day = week.days[this.currentDayIndex];
    const currentText = day.exercises[exerciseIndex].remarks[remarkIndex];

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'remark-input';
    input.value = currentText;
    input.maxLength = 150;

    tagEl.replaceWith(input);
    input.focus();
    input.select();

    const commit = () => {
      const val = input.value.trim();
      if (val) {
        day.exercises[exerciseIndex].remarks[remarkIndex] = val;
      } else {
        // Empty = delete remark
        day.exercises[exerciseIndex].remarks.splice(remarkIndex, 1);
      }
      this.saveData();
      this.renderExercises();
    };

    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') this.renderExercises();
    });
    input.addEventListener('blur', commit);
  },

  // --- Kebab Menu ---
  showKebabMenu(btn, exerciseIndex) {
    this.dismissKebabMenu();

    const dropdown = document.createElement('div');
    dropdown.className = 'kebab-dropdown';
    dropdown.innerHTML = `
      <button class="kebab-option edit-option" data-action="edit">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        Edit
      </button>
      <button class="kebab-option delete-option" data-action="delete">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
        </svg>
        Delete
      </button>
    `;

    const actionsDiv = btn.closest('.exercise-actions');
    actionsDiv.style.position = 'relative';
    actionsDiv.appendChild(dropdown);

    dropdown.querySelector('.edit-option').addEventListener('click', e => {
      e.stopPropagation();
      this.dismissKebabMenu();
      this.openEditModal(exerciseIndex);
    });

    dropdown.querySelector('.delete-option').addEventListener('click', e => {
      e.stopPropagation();
      this.dismissKebabMenu();
      this.confirmDeleteExercise(exerciseIndex);
    });

    setTimeout(() => {
      this._kebabDismissHandler = () => this.dismissKebabMenu();
      document.addEventListener('click', this._kebabDismissHandler, { once: true });
    }, 0);
  },

  dismissKebabMenu() {
    document.querySelectorAll('.kebab-dropdown').forEach(el => el.remove());
    if (this._kebabDismissHandler) {
      document.removeEventListener('click', this._kebabDismissHandler);
      this._kebabDismissHandler = null;
    }
  },

  confirmDeleteExercise(exerciseIndex) {
    const week = this.data.weeks[this.data.currentWeekIndex];
    if (!week) return;
    const day = week.days[this.currentDayIndex];
    if (!day) return;
    const exerciseName = day.exercises[exerciseIndex].name;

    const cards = document.querySelectorAll('.exercise-card');
    const card = cards[exerciseIndex];
    if (!card) return;

    card.classList.add('delete-confirm');
    const originalContent = card.innerHTML;
    card.innerHTML = `
      <div class="delete-confirm-content">
        <span>Delete "${Utils.escapeHtml(exerciseName)}"?</span>
        <div class="delete-confirm-actions">
          <button class="btn-confirm-delete">Delete</button>
          <button class="btn-cancel-delete">Cancel</button>
        </div>
      </div>
    `;

    card.querySelector('.btn-confirm-delete').addEventListener('click', e => {
      e.stopPropagation();
      day.exercises.splice(exerciseIndex, 1);
      this.saveData();
      this.renderExercises();
      Toast.show('Exercise deleted');
    });

    card.querySelector('.btn-cancel-delete').addEventListener('click', e => {
      e.stopPropagation();
      this.renderExercises();
    });
  },

  // --- Edit / Add Exercise Modal ---
  _editingExerciseIndex: null,

  openEditModal(exerciseIndex) {
    const modal = document.getElementById('editModal');
    modal.classList.add('active');

    // Reset to form mode
    document.getElementById('editFormMode').style.display = '';
    document.getElementById('editPasteMode').style.display = 'none';
    document.querySelectorAll('#editModeToggle button').forEach(b => b.classList.remove('active'));
    document.querySelector('#editModeToggle button[data-mode="form"]').classList.add('active');

    if (exerciseIndex >= 0) {
      // Edit mode
      const week = this.data.weeks[this.data.currentWeekIndex];
      const day = week.days[this.currentDayIndex];
      const ex = day.exercises[exerciseIndex];

      document.getElementById('editModalTitle').textContent = 'Edit Exercise';
      document.getElementById('editExName').value = ex.name || '';
      document.getElementById('editExLoad').value = ex.load || '';
      document.getElementById('editExSets').value = ex.sets || '';
      document.getElementById('editExReps').value = ex.reps || '';
      document.getElementById('editExRemarks').value = (ex.remarks || []).join(', ');
    } else {
      // Add mode
      document.getElementById('editModalTitle').textContent = 'Add Exercise';
      document.getElementById('editExName').value = '';
      document.getElementById('editExLoad').value = '';
      document.getElementById('editExSets').value = '';
      document.getElementById('editExReps').value = '';
      document.getElementById('editExRemarks').value = '';
    }

    this._editingExerciseIndex = exerciseIndex;
  },

  closeEditModal() {
    document.getElementById('editModal').classList.remove('active');
    this._editingExerciseIndex = null;
  },

  saveEditedExercise() {
    // Check which mode is active
    const pasteMode = document.getElementById('editPasteMode').style.display !== 'none';

    if (pasteMode) {
      this.saveFromPasteMode();
      return;
    }

    const name = document.getElementById('editExName').value.trim();
    if (!name) {
      Toast.show('Exercise name is required');
      return;
    }

    const load = document.getElementById('editExLoad').value.trim();
    const sets = document.getElementById('editExSets').value.trim();
    const reps = document.getElementById('editExReps').value.trim();
    const remarksStr = document.getElementById('editExRemarks').value.trim();
    const remarks = remarksStr ? remarksStr.split(',').map(r => r.trim()).filter(Boolean) : [];

    // Detect load unit
    let loadUnit = 'kg';
    if (/lb/i.test(load)) loadUnit = 'lb';
    else if (/p\s*$/i.test(load)) loadUnit = 'plates';

    const week = this.data.weeks[this.data.currentWeekIndex];
    if (!week) return;
    const day = week.days[this.currentDayIndex];
    if (!day) return;

    if (this._editingExerciseIndex >= 0) {
      // Update existing
      const ex = day.exercises[this._editingExerciseIndex];
      ex.name = name;
      ex.load = load;
      ex.loadUnit = loadUnit;
      ex.sets = parseInt(sets) || sets || '';
      ex.reps = reps;
      ex.remarks = remarks;
      Toast.show('Exercise updated');
    } else {
      // Add new
      day.exercises.push({
        id: Utils.generateId(),
        name,
        subtitle: null,
        load,
        loadUnit,
        sets: parseInt(sets) || sets || '',
        reps,
        remarks,
        youtubeUrl: null,
        completed: false
      });
      Toast.show('Exercise added');
    }

    this.saveData();
    this.closeEditModal();
    this.renderExercises();
  },

  saveFromPasteMode() {
    const text = document.getElementById('editPasteArea').value.trim();
    if (!text) {
      Toast.show('Paste exercise data');
      return;
    }

    // Parse each line as a tab-separated exercise
    const lines = text.split('\n').filter(l => l.trim());
    const week = this.data.weeks[this.data.currentWeekIndex];
    if (!week) return;
    const day = week.days[this.currentDayIndex];
    if (!day) return;

    let added = 0;
    for (const line of lines) {
      const parts = line.split('\t').map(s => s.trim());
      const name = parts[0];
      if (!name) continue;

      const load = parts[1] || '';
      const sets = parts[2] || '';
      const reps = parts[3] || '';
      const remarkStr = parts.slice(4).filter(Boolean);

      let loadUnit = 'kg';
      if (/lb/i.test(load)) loadUnit = 'lb';
      else if (/p\s*$/i.test(load)) loadUnit = 'plates';

      day.exercises.push({
        id: Utils.generateId(),
        name,
        subtitle: null,
        load,
        loadUnit,
        sets: parseInt(sets) || sets || '',
        reps,
        remarks: remarkStr,
        youtubeUrl: null,
        completed: false
      });
      added++;
    }

    if (added > 0) {
      this.saveData();
      this.closeEditModal();
      this.renderExercises();
      Toast.show(`Added ${added} exercise${added !== 1 ? 's' : ''}`);
    } else {
      Toast.show('No exercises found in paste data');
    }
  },

  // --- Swipe Gestures ---
  setupSwipeHandlers() {
    const container = document.getElementById('exerciseList');
    let startX = 0, startY = 0, startTime = 0;
    let currentCard = null, currentWrapper = null;
    let swiping = false, swipeDirection = null;

    container.addEventListener('touchstart', e => {
      const card = e.target.closest('.exercise-card');
      if (!card) return;
      // Don't swipe if touching interactive elements
      if (e.target.closest('button, a, input, .remark-tag, .remark-add-btn, .kebab-dropdown')) return;

      currentCard = card;
      currentWrapper = card.closest('.exercise-card-wrapper');
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      startTime = Date.now();
      swiping = false;
      swipeDirection = null;
      currentCard.style.transition = 'none';
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      if (!currentCard) return;

      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

      // If not yet determined direction, decide
      if (!swipeDirection) {
        if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
          swipeDirection = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        }
      }

      if (swipeDirection === 'vertical') {
        currentCard = null;
        return;
      }

      if (swipeDirection === 'horizontal') {
        e.preventDefault();
        swiping = true;
        // Limit swipe: right up to 80px, left up to -100px
        const clampedDx = dx > 0 ? Math.min(dx, 80) : Math.max(dx, -100);
        currentCard.style.transform = `translateX(${clampedDx}px)`;
      }
    }, { passive: false });

    container.addEventListener('touchend', e => {
      if (!currentCard || !swiping) {
        currentCard = null;
        return;
      }

      const dx = e.changedTouches[0].clientX - startX;
      const elapsed = Date.now() - startTime;
      currentCard.style.transition = 'transform 0.2s ease';

      const exIdx = parseInt(currentCard.dataset.exerciseIndex);
      const week = this.data.weeks[this.data.currentWeekIndex];
      const day = week ? week.days[this.currentDayIndex] : null;

      if (dx > 60 && elapsed < 400 && day) {
        // Swipe right → toggle completion
        currentCard.style.transform = 'translateX(0)';
        if (day.exercises[exIdx]) {
          day.exercises[exIdx].completed = !day.exercises[exIdx].completed;
          this.saveData();
          this.renderExercises();
        }
      } else if (dx < -60 && currentWrapper) {
        // Swipe left → reveal delete
        currentCard.style.transform = 'translateX(-80px)';
        const deleteBg = currentWrapper.querySelector('.swipe-delete-bg');
        if (deleteBg) {
          deleteBg.classList.add('visible');
          const deleteHandler = (evt) => {
            evt.stopPropagation();
            if (day && day.exercises[exIdx]) {
              day.exercises.splice(exIdx, 1);
              this.saveData();
              this.renderExercises();
              Toast.show('Exercise deleted');
            }
          };
          deleteBg.addEventListener('click', deleteHandler, { once: true });

          // Auto-reset after 3s
          setTimeout(() => {
            deleteBg.removeEventListener('click', deleteHandler);
            deleteBg.classList.remove('visible');
            if (currentCard) {
              currentCard.style.transition = 'transform 0.2s ease';
              currentCard.style.transform = 'translateX(0)';
            }
          }, 3000);
        }
      } else {
        // Snap back
        currentCard.style.transform = 'translateX(0)';
      }

      currentCard = null;
      currentWrapper = null;
      swiping = false;
      swipeDirection = null;
    }, { passive: true });
  },

  // --- Week / Day Delete (long-press) ---
  attachLongPress(element, onLongPress) {
    let timer = null;
    element.addEventListener('touchstart', e => {
      timer = setTimeout(() => {
        timer = null;
        if (navigator.vibrate) navigator.vibrate(50);
        onLongPress();
      }, 500);
    }, { passive: true });

    element.addEventListener('touchend', () => {
      if (timer) { clearTimeout(timer); timer = null; }
    });

    element.addEventListener('touchmove', () => {
      if (timer) { clearTimeout(timer); timer = null; }
    });
  },

  confirmDeleteWeek(weekIndex, pillEl) {
    const weekLabel = this.data.weeks[weekIndex].label;

    pillEl.classList.add('delete-mode');
    const originalText = pillEl.textContent;
    pillEl.textContent = 'Delete?';

    const confirmHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.data.weeks.splice(weekIndex, 1);
      if (this.data.weeks.length === 0) {
        this.data.currentWeekIndex = -1;
      } else if (this.data.currentWeekIndex >= this.data.weeks.length) {
        this.data.currentWeekIndex = this.data.weeks.length - 1;
      }
      this.currentDayIndex = 0;
      this.saveData();
      this.renderWeekTimeline();
      this.renderCurrentWeek();
      Toast.show(`${weekLabel} deleted`);
    };

    pillEl.addEventListener('click', confirmHandler, { once: true });

    setTimeout(() => {
      pillEl.removeEventListener('click', confirmHandler);
      if (pillEl.parentElement) {
        pillEl.classList.remove('delete-mode');
        pillEl.textContent = originalText;
      }
    }, 3000);
  },

  confirmDeleteDay(dayIndex, tabEl) {
    const week = this.data.weeks[this.data.currentWeekIndex];
    if (!week) return;
    const dayName = week.days[dayIndex].dayName || 'Day ' + (dayIndex + 1);

    tabEl.classList.add('delete-mode');
    const originalText = tabEl.textContent;
    tabEl.textContent = 'Delete?';

    const confirmHandler = (e) => {
      e.stopPropagation();
      e.preventDefault();
      week.days.splice(dayIndex, 1);
      if (this.currentDayIndex >= week.days.length) {
        this.currentDayIndex = Math.max(0, week.days.length - 1);
      }
      this.saveData();
      this.renderDayTabs();
      this.renderExercises();
      Toast.show(`${dayName} deleted`);
    };

    tabEl.addEventListener('click', confirmHandler, { once: true });

    setTimeout(() => {
      tabEl.removeEventListener('click', confirmHandler);
      if (tabEl.parentElement) {
        tabEl.classList.remove('delete-mode');
        tabEl.textContent = originalText;
      }
    }, 3000);
  }
};
