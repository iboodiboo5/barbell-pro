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
  _lastFocusedElement: null,
  _focusTrapHandler: null,

  openModal() {
    this._lastFocusedElement = document.activeElement;
    const modal = document.getElementById('uploadModal');
    modal.classList.add('active');
    document.getElementById('workoutTextarea').value = '';
    document.getElementById('parsePreview').style.display = 'none';
    setTimeout(() => document.getElementById('workoutTextarea').focus(), 300);
    this._trapFocus(modal);
  },

  closeModal() {
    const overlay = document.getElementById('uploadModal');
    overlay.classList.add('closing');
    setTimeout(() => overlay.classList.remove('active', 'closing'), 250);
    this._releaseFocus();
  },

  _trapFocus(container) {
    this._focusTrapHandler = (e) => {
      if (e.key !== 'Tab') return;
      const focusable = container.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', this._focusTrapHandler);
  },

  _releaseFocus() {
    if (this._focusTrapHandler) {
      document.removeEventListener('keydown', this._focusTrapHandler);
      this._focusTrapHandler = null;
    }
    if (this._lastFocusedElement) {
      this._lastFocusedElement.focus();
      this._lastFocusedElement = null;
    }
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

      // Check if this line starts a new exercise (Name + Load/Sets/Reps header)
      // If we already have lines in the block, flush the current exercise first
      const tabParts = rawLine.split('\t').map(s => s.trim());
      if (exerciseBlock.length > 0 && tabParts.length >= 4 && tabParts[0] &&
        /^load$/i.test(tabParts[1]) && /^sets$/i.test(tabParts[2]) && /^reps$/i.test(tabParts[3])) {
        flushExercise();
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
      // Capture any remarks on the header line itself (columns 4+)
      const headerRemarks = firstLine.slice(4).filter(r => r.trim());

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

      // Merge header-line remarks before data-line remarks
      if (headerRemarks.length > 0) {
        remarks = headerRemarks.concat(remarks);
      }
    } else {
      // No header row - check if data is on the same line as the name
      if (firstLine.length >= 4) {
        // Name + Load + Sets + Reps + Remarks on one line
        const maybeLoad = (firstLine[1] || '').trim();
        const maybeSets = (firstLine[2] || '').trim();
        const maybeReps = (firstLine[3] || '').trim();
        if (this.looksLikeLoad(maybeLoad) || maybeLoad === '') {
          // Standard: column 1 is a recognized load format
          load = maybeLoad;
          sets = maybeSets;
          reps = maybeReps;
          remarks = firstLine.slice(4).filter(r => r.trim());
        } else if (this.looksLikeSetsReps(maybeSets)) {
          // Fallback: column 1 is text but columns 2+ look like sets/reps
          // Treat column 1 as text load (e.g., "less resistance", "go heavy")
          load = maybeLoad;
          sets = maybeSets;
          reps = maybeReps;
          remarks = firstLine.slice(4).filter(r => r.trim());
        }
      }

      // Check if there's a second line with more data or a subtitle line
      if (parsedLines.length >= 2) {
        const secondLine = parsedLines[1];
        const firstCell = (secondLine[0] || '').trim();

        // If we didn't get data from first line, try second line
        // (check sets too — empty load with valid sets means first line was parsed)
        if (!load && !sets && secondLine.length >= 2) {
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

  looksLikeSetsReps(str) {
    if (!str) return false;
    str = str.trim();
    // Sets/reps always start with a digit (e.g., "5", "12", "2-30 min", "8 plates @10")
    return /^\d/.test(str);
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
    Haptics.success();
    Sound.importSuccess();
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
      // One-time long-press hint
      this.showLongPressHint();
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
      container.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.4">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          <h3>No Exercises</h3>
          <p>Add exercises or upload workout data</p>
        </div>
        <button class="add-exercise-btn" id="addExerciseBtn">+ Add Exercise</button>
      `;
      const addBtn = document.getElementById('addExerciseBtn');
      if (addBtn) addBtn.addEventListener('click', () => this.openEditModal(-1));
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
        <div class="swipe-complete-bg">
          <svg class="swipe-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <div class="swipe-delete-bg">
          <svg class="swipe-icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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
            <button class="complete-toggle ${ex.completed ? 'checked' : ''}" data-exercise-index="${i}" aria-label="${ex.completed ? 'Mark incomplete' : 'Mark complete'}"></button>
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
          <button class="remark-add-btn" data-exercise-index="${i}" title="Add remark" aria-label="Add remark">+</button>
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

    // Bind completion toggles (targeted update — no full rerender)
    container.querySelectorAll('.complete-toggle').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.exerciseIndex);
        const newState = !day.exercises[idx].completed;
        day.exercises[idx].completed = newState;
        this.saveData();

        // Update only this specific card
        const card = btn.closest('.exercise-card');
        if (card) {
          card.classList.toggle('completed', newState);
        }
        btn.classList.toggle('checked', newState);
        btn.setAttribute('aria-label', newState ? 'Mark incomplete' : 'Mark complete');

        if (newState) {
          Haptics.success();
          Sound.exerciseComplete();
        } else {
          Haptics.light();
          Sound.exerciseUncomplete();
        }
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
      this._deleteExerciseWithUndo(day, exerciseIndex);
    });

    card.querySelector('.btn-cancel-delete').addEventListener('click', e => {
      e.stopPropagation();
      this.renderExercises();
    });
  },

  // --- Undo Delete ---
  _undoState: null,
  _undoTimer: null,

  _deleteExerciseWithUndo(day, exerciseIndex) {
    if (this._undoTimer) {
      clearTimeout(this._undoTimer);
      this._undoTimer = null;
    }

    const deleted = day.exercises.splice(exerciseIndex, 1)[0];
    this.saveData();
    this.renderExercises();
    Haptics.warning();
    Sound.delete();

    this._undoState = {
      exercise: deleted,
      dayIndex: this.currentDayIndex,
      weekIndex: this.data.currentWeekIndex,
      insertIndex: exerciseIndex
    };

    this._showUndoToast(deleted.name);
  },

  _showUndoToast(name) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast undo-toast';
    toast.innerHTML = `
      <span>"${Utils.escapeHtml(name)}" deleted</span>
      <button class="undo-toast-btn">Undo</button>
    `;
    container.appendChild(toast);

    toast.querySelector('.undo-toast-btn').addEventListener('click', () => {
      this._undoDelete();
      toast.remove();
    });

    this._undoTimer = setTimeout(() => {
      toast.classList.add('out');
      toast.addEventListener('animationend', () => toast.remove());
      this._undoState = null;
      this._undoTimer = null;
    }, 5000);
  },

  _undoDelete() {
    if (!this._undoState) return;
    const { exercise, dayIndex, weekIndex, insertIndex } = this._undoState;
    const week = this.data.weeks[weekIndex];
    if (!week) return;
    const day = week.days[dayIndex];
    if (!day) return;

    day.exercises.splice(insertIndex, 0, exercise);
    this.saveData();
    this.renderExercises();
    this._undoState = null;
    if (this._undoTimer) { clearTimeout(this._undoTimer); this._undoTimer = null; }
    Toast.show('Exercise restored');
    Haptics.success();
    Sound.importSuccess();
  },

  // --- Edit / Add Exercise Modal ---
  _editingExerciseIndex: null,

  openEditModal(exerciseIndex) {
    this._lastFocusedElement = document.activeElement;
    const modal = document.getElementById('editModal');
    modal.classList.add('active');
    this._trapFocus(modal);

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
    const overlay = document.getElementById('editModal');
    overlay.classList.add('closing');
    setTimeout(() => overlay.classList.remove('active', 'closing'), 250);
    this._editingExerciseIndex = null;
    this._releaseFocus();
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

  // --- Swipe Gestures (Spotify-style elastic physics) ---
  setupSwipeHandlers() {
    const container = document.getElementById('exerciseList');
    const THRESHOLD = 100;          // px to trigger action
    const RESISTANCE = 0.85;        // near 1:1 finger tracking
    const OVERSHOOT_RESISTANCE = 0.3; // logarithmic past threshold
    const DELETE_LOCK = 80;         // px to lock delete open

    let startX = 0, startY = 0;
    let currentCard = null, currentWrapper = null;
    let swiping = false, swipeDirection = null;
    let activeDeleteWrapper = null; // track open delete state

    // Reset any open delete state
    const resetActiveDelete = () => {
      if (activeDeleteWrapper) {
        const card = activeDeleteWrapper.querySelector('.exercise-card');
        const bg = activeDeleteWrapper.querySelector('.swipe-delete-bg');
        if (card) {
          card.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
          card.style.transform = 'translateX(0)';
        }
        if (bg) bg.classList.remove('visible');
        activeDeleteWrapper = null;
      }
    };

    container.addEventListener('touchstart', e => {
      const card = e.target.closest('.exercise-card');
      if (!card) return;
      if (e.target.closest('button, a, input, .remark-tag, .remark-add-btn, .kebab-dropdown')) return;

      // If tapping on a different card, close any open delete
      const wrapper = card.closest('.exercise-card-wrapper');
      if (activeDeleteWrapper && activeDeleteWrapper !== wrapper) {
        resetActiveDelete();
      }

      currentCard = card;
      currentWrapper = wrapper;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      swiping = false;
      swipeDirection = null;
      currentCard.style.transition = 'none';
    }, { passive: true });

    container.addEventListener('touchmove', e => {
      if (!currentCard) return;

      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;

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

        // Elastic physics: near 1:1 before threshold, logarithmic resistance past it
        let translate;
        const absDx = Math.abs(dx);
        if (absDx <= THRESHOLD) {
          translate = dx * RESISTANCE;
        } else {
          const over = absDx - THRESHOLD;
          const dampened = THRESHOLD * RESISTANCE + over * OVERSHOOT_RESISTANCE;
          translate = dx > 0 ? dampened : -dampened;
        }

        currentCard.style.transform = `translateX(${translate}px)`;

        // Update icon scaling based on progress
        if (dx > 0 && currentWrapper) {
          const completeBg = currentWrapper.querySelector('.swipe-complete-bg');
          if (completeBg) {
            const progress = Math.min(absDx / THRESHOLD, 1);
            completeBg.style.opacity = String(Math.max(0.3, progress));
            const icon = completeBg.querySelector('.swipe-icon');
            if (icon) {
              const scale = 0.5 + progress * 0.5;
              icon.style.transform = `scale(${scale})`;
              icon.style.opacity = String(0.3 + progress * 0.7);
            }
          }
        } else if (dx < 0 && currentWrapper) {
          const deleteBg = currentWrapper.querySelector('.swipe-delete-bg');
          if (deleteBg) {
            const progress = Math.min(absDx / THRESHOLD, 1);
            deleteBg.style.opacity = String(Math.max(0.3, progress));
            const icon = deleteBg.querySelector('.swipe-icon');
            if (icon) {
              const scale = 0.5 + progress * 0.5;
              icon.style.transform = `scale(${scale})`;
              icon.style.opacity = String(0.3 + progress * 0.7);
            }
          }
        }
      }
    }, { passive: false });

    container.addEventListener('touchend', e => {
      if (!currentCard || !swiping) {
        currentCard = null;
        return;
      }

      const dx = e.changedTouches[0].clientX - startX;
      const absDx = Math.abs(dx);

      // Spring-back transition
      currentCard.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';

      const exIdx = parseInt(currentCard.dataset.exerciseIndex);
      const week = this.data.weeks[this.data.currentWeekIndex];
      const day = week ? week.days[this.currentDayIndex] : null;

      if (dx > 0 && absDx >= THRESHOLD && day && day.exercises[exIdx]) {
        // Swipe right past threshold → complete
        // Brief overshoot then spring back
        currentCard.style.transform = 'translateX(120px)';
        const card = currentCard;
        const wrapper = currentWrapper;
        setTimeout(() => {
          card.style.transition = 'transform 0.35s cubic-bezier(0.34, 1.56, 0.64, 1)';
          card.style.transform = 'translateX(0)';
          // Reset backgrounds
          const completeBg = wrapper.querySelector('.swipe-complete-bg');
          if (completeBg) {
            completeBg.style.opacity = '0';
            const icon = completeBg.querySelector('.swipe-icon');
            if (icon) { icon.style.transform = ''; icon.style.opacity = ''; }
          }
        }, 150);

        // Toggle completion
        const newState = !day.exercises[exIdx].completed;
        day.exercises[exIdx].completed = newState;
        this.saveData();

        // Targeted update (Phase 6 logic)
        const cardEl = currentCard;
        cardEl.classList.toggle('completed', newState);
        const toggle = cardEl.querySelector('.complete-toggle');
        if (toggle) {
          toggle.classList.toggle('checked', newState);
          toggle.setAttribute('aria-label', newState ? 'Mark incomplete' : 'Mark complete');
        }

        if (newState) { Haptics.success(); Sound.exerciseComplete(); }
        else { Haptics.light(); Sound.exerciseUncomplete(); }

      } else if (dx < 0 && absDx >= DELETE_LOCK && currentWrapper) {
        // Swipe left past lock point → reveal delete button
        currentCard.style.transform = `translateX(-${DELETE_LOCK}px)`;
        const deleteBg = currentWrapper.querySelector('.swipe-delete-bg');
        if (deleteBg) {
          deleteBg.classList.add('visible');
          deleteBg.style.opacity = '1';
          const icon = deleteBg.querySelector('.swipe-icon');
          if (icon) { icon.style.transform = 'scale(1)'; icon.style.opacity = '1'; }

          activeDeleteWrapper = currentWrapper;

          const deleteHandler = (evt) => {
            evt.stopPropagation();
            if (day && day.exercises[exIdx]) {
              this._deleteExerciseWithUndo(day, exIdx);
            }
            activeDeleteWrapper = null;
          };
          deleteBg.addEventListener('click', deleteHandler, { once: true });

          // Auto-reset after 3s
          const wrapperRef = currentWrapper;
          const cardRef = currentCard;
          setTimeout(() => {
            if (activeDeleteWrapper === wrapperRef) {
              deleteBg.removeEventListener('click', deleteHandler);
              deleteBg.classList.remove('visible');
              deleteBg.style.opacity = '';
              if (icon) { icon.style.transform = ''; icon.style.opacity = ''; }
              if (cardRef) {
                cardRef.style.transition = 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)';
                cardRef.style.transform = 'translateX(0)';
              }
              activeDeleteWrapper = null;
            }
          }, 3000);
        }
      } else {
        // Snap back to rest — no action
        currentCard.style.transform = 'translateX(0)';

        // Reset any background state
        if (currentWrapper) {
          const completeBg = currentWrapper.querySelector('.swipe-complete-bg');
          const deleteBg = currentWrapper.querySelector('.swipe-delete-bg');
          if (completeBg) {
            completeBg.style.opacity = '0';
            const icon = completeBg.querySelector('.swipe-icon');
            if (icon) { icon.style.transform = ''; icon.style.opacity = ''; }
          }
          if (deleteBg && !deleteBg.classList.contains('visible')) {
            deleteBg.style.opacity = '0';
            const icon = deleteBg.querySelector('.swipe-icon');
            if (icon) { icon.style.transform = ''; icon.style.opacity = ''; }
          }
        }
      }

      currentCard = null;
      currentWrapper = null;
      swiping = false;
      swipeDirection = null;
    }, { passive: true });
  },

  // --- Week / Day Delete (long-press with visual hint) ---
  attachLongPress(element, onLongPress) {
    let timer = null;
    let hintTimer = null;

    element.addEventListener('touchstart', e => {
      // Visual hint at 200ms (before 500ms trigger)
      hintTimer = setTimeout(() => {
        element.classList.add('press-hint');
      }, 200);

      timer = setTimeout(() => {
        timer = null;
        element.classList.remove('press-hint');
        Haptics.longPress();
        onLongPress();
      }, 500);
    }, { passive: true });

    element.addEventListener('touchend', () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
      element.classList.remove('press-hint');
    });

    element.addEventListener('touchmove', () => {
      if (timer) { clearTimeout(timer); timer = null; }
      if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
      element.classList.remove('press-hint');
    });
  },

  // Show one-time long-press hint on first use
  showLongPressHint() {
    if (Storage.get('barbellPro_longPressHinted')) return;
    const firstPill = document.querySelector('.week-pill:not(.add-week)');
    if (!firstPill) return;

    const hint = document.createElement('div');
    hint.className = 'long-press-hint';
    hint.textContent = 'Hold to delete';
    firstPill.style.position = 'relative';
    firstPill.appendChild(hint);

    Storage.set('barbellPro_longPressHinted', true);
    setTimeout(() => {
      hint.classList.add('out');
      hint.addEventListener('animationend', () => hint.remove());
    }, 3000);
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
