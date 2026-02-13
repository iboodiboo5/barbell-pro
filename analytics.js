/* ============================================
   OK BARBELL - Lift Analytics Module
   ============================================ */

// LIFT_GROUPS is defined in app.js (shared constant)

const Analytics = {
  selectedLift: null,
  liftData: {},
  _lastTooltipState: null,
  _consistencySettingsBound: false,

  init() {
    // Analytics bootstraps through refresh().
  },

  refresh() {
    // Show skeleton shimmer during computation
    const chartContainers = document.querySelectorAll('.chart-container');
    chartContainers.forEach(c => c.classList.add('skeleton', 'chart-skeleton'));

    requestAnimationFrame(() => {
      this.renderConsistency();
      this.buildLiftData();
      this.renderLiftSelector();

      const lifts = Object.keys(this.liftData);
      if (lifts.length === 0) {
        document.getElementById('analyticsEmpty').style.display = 'flex';
        document.getElementById('analyticsContent').style.display = 'none';
        chartContainers.forEach(c => c.classList.remove('skeleton', 'chart-skeleton'));
        return;
      }

      document.getElementById('analyticsEmpty').style.display = 'none';
      document.getElementById('analyticsContent').style.display = 'block';

      if (!this.selectedLift || !this.liftData[this.selectedLift]) {
        this.selectedLift = lifts[0];
      }

      this.renderLiftSelector();
      this.renderCharts();
      this.renderStats();

      // Remove skeleton after rendering
      chartContainers.forEach(c => c.classList.remove('skeleton', 'chart-skeleton'));
    });
  },

  // Calendar week key from a YYYY-MM-DD date string (ISO 8601 week)
  _getISOWeekKey(dateStr) {
    const d = new Date(dateStr + 'T00:00:00'); // local timezone, avoid UTC shift
    d.setDate(d.getDate() + 4 - (d.getDay() || 7)); // nearest Thursday
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
    return d.getFullYear() + '-W' + weekNum;
  },

  renderConsistency() {
    const section = document.getElementById('consistencySection');
    const settingsCard = document.getElementById('consistencySettingsCard');
    const workouts = Storage.get('barbellPro_workouts');

    if (!workouts || !workouts.weeks || workouts.weeks.length === 0) {
      section.style.display = 'none';
      if (settingsCard) settingsCard.style.display = 'none';
      return;
    }

    this._bindConsistencySettings();
    const settings = this._getConsistencySettings(workouts);
    const timeline = this._buildSessionTimeline(workouts, settings.startDate);
    const sessionDates = timeline
      .filter(d => d.completed)
      .map(d => d.isoDate);

    const completedDates = new Set(sessionDates);
    const completedCount = completedDates.size;

    section.style.display = '';
    if (settingsCard) settingsCard.style.display = '';

    const elapsedDays = this._elapsedDaysSince(settings.startDate);
    const expectedSessions = (settings.baselineDays * elapsedDays) / 7;
    const completionRate = expectedSessions > 0
      ? Math.round((completedCount / expectedSessions) * 100)
      : 0;

    const rateEl = document.getElementById('consistencyRate');
    rateEl.textContent = completionRate + '%';
    rateEl.className = 'consistency-rate';
    if (completionRate >= 100) rateEl.classList.add('rate-green');
    else if (completionRate >= 75) rateEl.classList.add('rate-gold');
    else rateEl.classList.add('rate-red');

    document.getElementById('consistencyCompleted').textContent = String(completedCount);
    const missedSessions = Math.ceil(Math.max(0, expectedSessions - completedCount));
    document.getElementById('consistencyMissed').textContent = String(missedSessions);

    const trendWeeks = this._buildTrendWeeks(completedDates, settings.baselineDays);
    const grid = document.getElementById('consistencyGrid');
    grid.innerHTML = trendWeeks.map((w, i) => {
      const ratio = settings.baselineDays > 0 ? (w.completed / settings.baselineDays) : 0;
      let level = 0;
      if (ratio >= 1) level = 4;
      else if (ratio >= 0.75) level = 3;
      else if (ratio >= 0.5) level = 2;
      else if (ratio > 0) level = 1;

      return `<div class="consistency-cell-group">
        <div class="consistency-cell level-${level}" title="${Utils.escapeHtml(w.label)}: ${w.completed}/${settings.baselineDays}">
          <span class="cell-count">${w.completed}</span>
        </div>
        <div class="consistency-cell-label">W${i + 1}</div>
      </div>`;
    }).join('');

    const streakEl = document.getElementById('consistencyStreak');
    let streak = 0;
    for (let i = trendWeeks.length - 1; i >= 0; i--) {
      if (trendWeeks[i].completed >= settings.baselineDays) {
        streak++;
      } else {
        break;
      }
    }

    if (streak > 0) {
      streakEl.innerHTML = `<span class="streak-fire">\u{1F525}</span> ${streak} week${streak !== 1 ? 's' : ''} at baseline <span class="streak-msg">keep momentum</span>`;
      streakEl.style.display = '';
    } else {
      streakEl.innerHTML = `<span class="streak-msg">No active streak yet</span>`;
      streakEl.style.display = '';
    }
  },

  _bindConsistencySettings() {
    if (this._consistencySettingsBound) return;
    this._consistencySettingsBound = true;

    const baselineInput = document.getElementById('consistencyBaselineInput');
    const startInput = document.getElementById('consistencyStartDateInput');

    if (baselineInput) {
      baselineInput.addEventListener('change', () => {
        const next = Math.max(1, Math.min(7, parseInt(baselineInput.value, 10) || 4));
        baselineInput.value = String(next);
        Storage.set('barbellPro_consistencyBaselineDays', next);
        this.refresh();
      });
    }

    if (startInput) {
      startInput.addEventListener('change', () => {
        const value = (startInput.value || '').trim();
        if (this._isISODate(value)) {
          Storage.set('barbellPro_consistencyStartDate', value);
          this.refresh();
        }
      });
    }
  },

  _getConsistencySettings(workouts) {
    const baselineRaw = Storage.get('barbellPro_consistencyBaselineDays');
    const baselineDays = Math.max(1, Math.min(7, parseInt(baselineRaw, 10) || 4));

    let startDate = Storage.get('barbellPro_consistencyStartDate');
    if (!this._isISODate(startDate)) {
      startDate = this._inferDefaultStartDate(workouts);
      Storage.set('barbellPro_consistencyStartDate', startDate);
    }

    const baselineInput = document.getElementById('consistencyBaselineInput');
    const startInput = document.getElementById('consistencyStartDateInput');
    if (baselineInput) baselineInput.value = String(baselineDays);
    if (startInput) startInput.value = startDate;

    return { baselineDays, startDate };
  },

  _inferDefaultStartDate(workouts) {
    const dates = [];
    for (const week of workouts.weeks || []) {
      for (const day of week.days || []) {
        const iso = (day.date || '').trim();
        if (this._isISODate(iso)) dates.push(iso);
      }
    }
    if (dates.length > 0) return dates.sort()[0];
    return this._toISODate(new Date());
  },

  _buildSessionTimeline(workouts, startDateISO) {
    const startDate = this._parseISODate(startDateISO);
    const timeline = [];

    for (let wi = 0; wi < workouts.weeks.length; wi++) {
      const week = workouts.weeks[wi];
      for (let di = 0; di < (week.days || []).length; di++) {
        const day = week.days[di];
        const completed = !!(day.exercises && day.exercises.some(ex => ex.completed));
        let isoDate = (day.date || '').trim();
        if (!this._isISODate(isoDate)) {
          const inferred = new Date(startDate);
          inferred.setDate(inferred.getDate() + wi * 7 + di);
          isoDate = this._toISODate(inferred);
        }
        timeline.push({
          isoDate,
          completed
        });
      }
    }
    return timeline;
  },

  _buildTrendWeeks(completedDateSet, baselineDays) {
    const today = new Date();
    const trend = [];
    for (let i = 5; i >= 0; i--) {
      const weekEnd = new Date(today);
      weekEnd.setHours(0, 0, 0, 0);
      weekEnd.setDate(weekEnd.getDate() - (i * 7));
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekEnd.getDate() - 6);

      let completed = 0;
      const cursor = new Date(weekStart);
      while (cursor <= weekEnd) {
        const key = this._toISODate(cursor);
        if (completedDateSet.has(key)) completed++;
        cursor.setDate(cursor.getDate() + 1);
      }

      trend.push({
        label: `${this._toISODate(weekStart)} to ${this._toISODate(weekEnd)}`,
        completed,
        target: baselineDays
      });
    }
    return trend;
  },

  _elapsedDaysSince(startDateISO) {
    const start = this._parseISODate(startDateISO);
    const today = new Date();
    start.setHours(0, 0, 0, 0);
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today - start) / 86400000) + 1;
    return Math.max(0, diff);
  },

  _isISODate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
  },

  _parseISODate(iso) {
    const [y, m, d] = (iso || '').split('-').map(Number);
    return new Date(y || 1970, (m || 1) - 1, d || 1);
  },

  _toISODate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  },

  buildLiftData() {
    const workouts = Storage.get('barbellPro_workouts');
    if (!workouts || !workouts.weeks) {
      this.liftData = {};
      return;
    }

    const data = {};

    // Collect all unique exercise names first
    const allExercises = new Map(); // canonical -> [{date, weight, sets, reps, name}]

    for (let wi = 0; wi < workouts.weeks.length; wi++) {
      const week = workouts.weeks[wi];
      for (let di = 0; di < (week.days || []).length; di++) {
        const day = week.days[di];
        for (let ei = 0; ei < (day.exercises || []).length; ei++) {
          const ex = day.exercises[ei];
          const canonical = this.identifyLift(ex.name);
          if (!canonical) continue;

          const weight = this.parseLoadValue(ex.load);
          if (weight === null || weight === 0) continue;

          const sets = typeof ex.sets === 'number' ? ex.sets : parseInt(ex.sets) || 0;
          const reps = parseInt(ex.reps) || 0;

          if (!allExercises.has(canonical)) {
            allExercises.set(canonical, []);
          }

          allExercises.get(canonical).push({
            date: day.date || '',
            dayName: day.dayName || '',
            weight,
            sets,
            reps,
            volume: weight * sets * reps,
            name: ex.name,
            weekLabel: week.label,
            weekIndex: wi,
            dayIndex: di,
            exerciseIndex: ei,
            exerciseId: ex.id
          });
        }
      }
    }

    // Also collect individual exercise variants
    for (let wi = 0; wi < workouts.weeks.length; wi++) {
      const week = workouts.weeks[wi];
      for (let di = 0; di < (week.days || []).length; di++) {
        const day = week.days[di];
        for (let ei = 0; ei < (day.exercises || []).length; ei++) {
          const ex = day.exercises[ei];
          const weight = this.parseLoadValue(ex.load);
          if (weight === null || weight === 0) continue;

          const sets = typeof ex.sets === 'number' ? ex.sets : parseInt(ex.sets) || 0;
          const reps = parseInt(ex.reps) || 0;
          const name = ex.name.trim();

          if (!allExercises.has(name) && this.identifyLift(name)) {
            // Already captured under canonical
          } else if (!this.identifyLift(name)) {
            // Not a tracked lift group, add individually if it has numeric load
            if (!allExercises.has(name)) {
              allExercises.set(name, []);
            }
            allExercises.get(name).push({
              date: day.date || '',
              dayName: day.dayName || '',
              weight,
              sets,
              reps,
              volume: weight * sets * reps,
              name: ex.name,
              weekLabel: week.label,
              weekIndex: wi,
              dayIndex: di,
              exerciseIndex: ei,
              exerciseId: ex.id
            });
          }
        }
      }
    }

    // Filter out lifts with less than 2 data points
    for (const [name, entries] of allExercises) {
      if (entries.length >= 1) {
        data[name] = entries;
      }
    }

    this.liftData = data;
  },

  identifyLift(exerciseName) {
    const lower = exerciseName.toLowerCase().trim();
    for (const [canonical, aliases] of Object.entries(LIFT_GROUPS)) {
      if (aliases.some(alias => lower.includes(alias))) {
        return canonical;
      }
    }
    return null;
  },

  parseLoadValue(load) {
    if (!load || typeof load !== 'string') return null;
    load = load.trim().toLowerCase();
    if (load === 'done' || load === '') return null;

    // Extract numeric part: "60", "30lb", "14p", "60kg", "40.5"
    const match = load.match(/^(\d+\.?\d*)/);
    if (match) return parseFloat(match[1]);
    return null;
  },

  renderLiftSelector() {
    const container = document.getElementById('liftSelector');
    const searchWrapper = document.getElementById('liftSearchWrapper');
    let lifts = Object.keys(this.liftData);

    // Show/hide search bar based on whether we have lifts
    if (searchWrapper) {
      searchWrapper.style.display = lifts.length > 0 ? '' : 'none';
    }

    // Smart sorting: compound-biased recent frequency
    const workouts = Storage.get('barbellPro_workouts');
    if (workouts && workouts.weeks) {
      const recentWeeks = workouts.weeks.slice(-6);
      const frequency = {};
      for (const week of recentWeeks) {
        for (const day of week.days) {
          for (const ex of day.exercises) {
            // Check both canonical and exact name
            const canonical = this.identifyLift(ex.name);
            const key = canonical && this.liftData[canonical] ? canonical : ex.name.trim();
            if (this.liftData[key]) {
              frequency[key] = (frequency[key] || 0) + 1;
            }
          }
        }
      }

      // Compound bias: multiply by 1.5
      if (typeof BARBELL_COMPOUNDS !== 'undefined') {
        for (const compound of BARBELL_COMPOUNDS) {
          if (frequency[compound]) frequency[compound] *= 1.5;
        }
      }

      // Sort: by weighted frequency descending, then alphabetical
      lifts.sort((a, b) => (frequency[b] || 0) - (frequency[a] || 0) || a.localeCompare(b));
    }

    container.innerHTML = lifts.map(name =>
      `<button class="lift-pill ${name === this.selectedLift ? 'active' : ''}" data-lift="${Utils.escapeHtml(name)}" aria-label="Select ${Utils.escapeHtml(name)}">${Utils.escapeHtml(name)}</button>`
    ).join('');

    container.querySelectorAll('.lift-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this.selectedLift = pill.dataset.lift;
        this.renderLiftSelector();
        this.renderCharts();
        this.renderStats();
      });
    });

    // Bind search
    this._bindLiftSearch();
  },

  _bindLiftSearch() {
    const input = document.getElementById('liftSearch');
    if (!input || input._bound) return;
    input._bound = true;

    input.addEventListener('input', () => {
      const query = input.value.toLowerCase();
      document.querySelectorAll('.lift-pill').forEach(pill => {
        const name = pill.dataset.lift.toLowerCase();
        pill.style.display = name.includes(query) ? '' : 'none';
      });
    });
  },

  renderCharts() {
    const entries = this.liftData[this.selectedLift];
    if (!entries || entries.length === 0) return;

    document.getElementById('chartTitle').textContent = this.selectedLift + ' Progression';

    // Progression chart (weight over time)
    const progressionCanvas = document.getElementById('progressionChart');
    const progressionData = entries.map((e, i) => ({
      x: i,
      y: e.weight,
      label: e.weekLabel || e.date || ('Session ' + (i + 1)),
      sets: e.sets,
      reps: e.reps,
      ref: {
        weekIndex: e.weekIndex,
        dayIndex: e.dayIndex,
        exerciseIndex: e.exerciseIndex,
        exerciseId: e.exerciseId,
        date: e.date || ''
      }
    }));
    this.drawLineChart(progressionCanvas, progressionData, {
      color: '#e94560',
      fillColor: 'rgba(233, 69, 96, 0.1)',
      yLabel: 'Weight',
      dotColor: '#e94560',
      unit: 'kg'
    });

    // Volume chart
    const volumeCanvas = document.getElementById('volumeChart');
    const volumeData = entries.filter(e => e.volume > 0).map((e, i) => ({
      x: i,
      y: e.volume,
      label: e.weekLabel || e.date || ('Session ' + (i + 1)),
      sets: e.sets,
      reps: e.reps,
      ref: {
        weekIndex: e.weekIndex,
        dayIndex: e.dayIndex,
        exerciseIndex: e.exerciseIndex,
        exerciseId: e.exerciseId,
        date: e.date || ''
      }
    }));
    if (volumeData.length > 0) {
      this.drawLineChart(volumeCanvas, volumeData, {
        color: '#3498db',
        fillColor: 'rgba(52, 152, 219, 0.1)',
        yLabel: 'Volume',
        dotColor: '#3498db',
        unit: 'vol'
      });
    }
  },

  drawLineChart(canvas, data, options = {}) {
    if (!data || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const w = rect.width;
    const h = rect.height;
    const pad = { top: 20, right: 16, bottom: 35, left: 45 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;

    // Clear
    ctx.clearRect(0, 0, w, h);

    const yValues = data.map(d => d.y);
    const yMin = Math.min(...yValues) * 0.9;
    const yMax = Math.max(...yValues) * 1.1;
    const yRange = yMax - yMin || 1;

    // Grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1;
    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const y = pad.top + (chartH * i / gridLines);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();

      // Y-axis labels
      const val = yMax - (yRange * i / gridLines);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.font = '10px -apple-system, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(val), pad.left - 8, y + 4);
    }

    // X-axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.font = '9px -apple-system, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const maxLabels = Math.min(data.length, 6);
    const step = Math.max(1, Math.floor(data.length / maxLabels));
    for (let i = 0; i < data.length; i += step) {
      const x = pad.left + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW);
      const label = data[i].label || '';
      const shortLabel = label.length > 8 ? label.substring(0, 8) : label;
      ctx.fillText(shortLabel, x, h - pad.bottom + 18);
    }

    if (data.length === 1) {
      const x = pad.left + chartW / 2;
      const y = pad.top + chartH / 2;
      ctx.fillStyle = options.dotColor || '#e94560';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();

      // Store for interaction
      canvas._chartData = { points: [{ x, y }], data, options, pad, chartW, chartH, yMin, yRange };
      this._attachChartInteraction(canvas);
      return;
    }

    // Build points
    const points = data.map((d, i) => ({
      x: pad.left + (i / (data.length - 1)) * chartW,
      y: pad.top + chartH - ((d.y - yMin) / yRange) * chartH
    }));

    // Area fill
    if (options.fillColor) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, pad.top + chartH);
      points.forEach(p => ctx.lineTo(p.x, p.y));
      ctx.lineTo(points[points.length - 1].x, pad.top + chartH);
      ctx.closePath();

      const gradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartH);
      gradient.addColorStop(0, options.fillColor);
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = gradient;
      ctx.fill();
    }

    // Line
    ctx.strokeStyle = options.color || '#e94560';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.stroke();

    // Dots
    ctx.fillStyle = options.dotColor || '#e94560';
    points.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Store for interaction
    canvas._chartData = { points, data, options, pad, chartW, chartH, yMin, yRange };
    this._attachChartInteraction(canvas);
  },

  _attachChartInteraction(canvas) {
    // Remove old handler if any
    if (canvas._chartTapHandler) {
      canvas.removeEventListener('click', canvas._chartTapHandler);
    }

    canvas._chartTapHandler = (e) => {
      const rect = canvas.getBoundingClientRect();
      const tapX = e.clientX - rect.left;
      const { points, data, options } = canvas._chartData;

      // Find nearest point
      let nearestIdx = 0;
      let nearestDist = Infinity;
      points.forEach((p, i) => {
        const dist = Math.abs(p.x - tapX);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      });

      // Only show if within reasonable distance
      if (nearestDist > 40) {
        this._dismissTooltip(canvas);
        return;
      }

      this._showChartTooltip(canvas, points[nearestIdx], data[nearestIdx], options, nearestIdx);
    };

    canvas.addEventListener('click', canvas._chartTapHandler);
  },

  _showChartTooltip(canvas, point, dataPoint, options, pointIndex = null) {
    // Remove existing tooltip
    this._dismissTooltip(canvas);

    const container = canvas.closest('.chart-container');
    if (!container) return;
    container.style.position = 'relative';

    const tooltip = document.createElement('div');
    tooltip.className = 'chart-tooltip';

    const valueStr = options.unit === 'vol'
      ? `Volume: ${Math.round(dataPoint.y)}`
      : `Weight: ${Utils.formatWeight(dataPoint.y)}kg`;
    const setsReps = (dataPoint.sets && dataPoint.reps)
      ? `${dataPoint.sets} × ${dataPoint.reps}`
      : '';

    tooltip.innerHTML = `
      <div class="chart-tooltip-label">${Utils.escapeHtml(dataPoint.label)}</div>
      <div class="chart-tooltip-value">${valueStr}</div>
      ${setsReps ? `<div class="chart-tooltip-detail">${setsReps}</div>` : ''}
    `;

    // Position tooltip relative to chart container
    const canvasRect = canvas.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    let left = point.x + (canvasRect.left - containerRect.left);
    const top = point.y + (canvasRect.top - containerRect.top) - 60;

    // Keep within bounds
    tooltip.style.left = left + 'px';
    tooltip.style.top = Math.max(0, top) + 'px';

    container.appendChild(tooltip);
    canvas._tooltip = tooltip;
    canvas._activeTooltipIndex = pointIndex;
    this._lastTooltipState = {
      canvasId: canvas.id,
      pointIndex
    };

    if (dataPoint.ref && typeof App !== 'undefined' && App && typeof App.openTrackerFromAnalytics === 'function') {
      tooltip.style.cursor = 'pointer';
      tooltip.addEventListener('click', (e) => {
        e.stopPropagation();
        const state = this.captureViewState();
        App.openTrackerFromAnalytics(dataPoint.ref, state);
      });
    }

    // Add indicator line on canvas
    this._drawIndicatorLine(canvas, point);

    // Auto-dismiss after 5s
    canvas._tooltipTimer = setTimeout(() => this._dismissTooltip(canvas), 5000);
  },

  _drawIndicatorLine(canvas, point) {
    const ctx = canvas.getContext('2d');
    const { pad, chartH } = canvas._chartData;

    // Save and draw (no ctx.scale — context already scaled by drawLineChart)
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(point.x, pad.top);
    ctx.lineTo(point.x, pad.top + chartH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Highlight dot
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = canvas._chartData.options.color || '#e94560';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  },

  _dismissTooltip(canvas) {
    if (canvas._tooltip) {
      canvas._tooltip.remove();
      canvas._tooltip = null;
    }
    if (canvas._tooltipTimer) {
      clearTimeout(canvas._tooltipTimer);
      canvas._tooltipTimer = null;
    }
    // Redraw chart to remove indicator line (avoid recursion)
    if (canvas._chartData && !canvas._redrawing) {
      canvas._redrawing = true;
      const { data, options } = canvas._chartData;
      this.drawLineChart(canvas, data, options);
      canvas._redrawing = false;
    }
  },

  renderStats() {
    const entries = this.liftData[this.selectedLift];
    if (!entries || entries.length === 0) return;

    const sorted = [...entries];
    const latest = sorted[sorted.length - 1];
    const first = sorted[0];
    const totalVolume = sorted.reduce((sum, e) => sum + e.volume, 0);
    const progression = latest.weight - first.weight;

    document.getElementById('currentMax').textContent = Utils.formatWeight(latest.weight);
    document.getElementById('totalVolume').textContent = this.formatVolume(totalVolume);
    document.getElementById('progression').textContent =
      (progression >= 0 ? '+' : '') + Utils.formatWeight(progression);
    document.getElementById('progression').style.color =
      progression >= 0 ? 'var(--accent-green)' : 'var(--accent-primary)';
    document.getElementById('sessionCount').textContent = sorted.length;
  },

  formatVolume(vol) {
    if (vol >= 10000) return (vol / 1000).toFixed(1) + 'k';
    return Math.round(vol).toString();
  },

  captureViewState() {
    return {
      selectedLift: this.selectedLift,
      scrollY: window.scrollY,
      tooltip: this._lastTooltipState ? { ...this._lastTooltipState } : null
    };
  },

  restoreViewState(state) {
    if (!state) return;

    if (state.selectedLift && this.liftData[state.selectedLift]) {
      this.selectedLift = state.selectedLift;
    }

    this.renderLiftSelector();
    this.renderCharts();
    this.renderStats();

    requestAnimationFrame(() => {
      if (typeof state.scrollY === 'number') {
        window.scrollTo({ top: state.scrollY, behavior: 'smooth' });
      }

      if (state.tooltip && state.tooltip.canvasId) {
        const canvas = document.getElementById(state.tooltip.canvasId);
        const chart = canvas && canvas._chartData;
        const pointIndex = Number.isInteger(state.tooltip.pointIndex) ? state.tooltip.pointIndex : -1;
        if (chart && pointIndex >= 0 && chart.points[pointIndex] && chart.data[pointIndex]) {
          this._showChartTooltip(canvas, chart.points[pointIndex], chart.data[pointIndex], chart.options, pointIndex);
        }
      }
    });
  }
};
