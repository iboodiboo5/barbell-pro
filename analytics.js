/* ============================================
   KK BARBELL - Lift Analytics Module
   ============================================ */

// LIFT_GROUPS is defined in app.js (shared constant)

const Analytics = {
  selectedLift: null,
  liftData: {},

  init() {
    // Bind calculator events once
    this.initCalculators();
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
      this.renderHistory();

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
    const TARGET_DAYS = 4;
    const section = document.getElementById('consistencySection');
    const workouts = Storage.get('barbellPro_workouts');

    if (!workouts || !workouts.weeks || workouts.weeks.length === 0) {
      section.style.display = 'none';
      return;
    }

    // Collect all dates and completed dates across every programmed week
    const allDates = new Set();
    const completedDates = new Set();

    for (const week of workouts.weeks) {
      if (!week.days) continue;
      for (const day of week.days) {
        if (!day.date || !day.date.trim()) continue;
        const dateStr = day.date.trim();
        allDates.add(dateStr);
        if (day.exercises && day.exercises.some(ex => ex.completed)) {
          completedDates.add(dateStr);
        }
      }
    }

    if (allDates.size === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';

    // Find date range (earliest → latest across all days)
    const sortedDates = [...allDates].sort();
    const firstDate = new Date(sortedDates[0] + 'T00:00:00');
    const lastDate = new Date(sortedDates[sortedDates.length - 1] + 'T00:00:00');

    // Build every calendar week from first to last date
    const weekMap = new Map(); // weekKey → count of completed sessions
    const weekOrder = []; // ordered week keys

    // Walk day-by-day from firstDate to lastDate to discover all calendar weeks
    const cursor = new Date(firstDate);
    while (cursor <= lastDate) {
      const iso = cursor.toISOString().slice(0, 10);
      const weekKey = this._getISOWeekKey(iso);
      if (!weekMap.has(weekKey)) {
        weekMap.set(weekKey, 0);
        weekOrder.push(weekKey);
      }
      cursor.setDate(cursor.getDate() + 1);
    }

    // Count completed sessions per calendar week
    for (const dateStr of completedDates) {
      const weekKey = this._getISOWeekKey(dateStr);
      if (weekMap.has(weekKey)) {
        weekMap.set(weekKey, weekMap.get(weekKey) + 1);
      }
    }

    // Build week data array
    const weekData = weekOrder.map(key => ({
      key,
      completed: weekMap.get(key)
    }));

    // Overall completion rate: completed sessions / (calendar weeks × target)
    const totalCompleted = weekData.reduce((sum, w) => sum + w.completed, 0);
    const totalPossible = weekData.length * TARGET_DAYS;
    const completionRate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    const rateEl = document.getElementById('consistencyRate');
    rateEl.textContent = completionRate + '%';
    rateEl.className = 'consistency-rate';
    if (completionRate >= 90) rateEl.classList.add('rate-green');
    else if (completionRate >= 70) rateEl.classList.add('rate-gold');
    else rateEl.classList.add('rate-red');

    // Heatmap grid — one cell per calendar week
    const grid = document.getElementById('consistencyGrid');
    grid.innerHTML = weekData.map((w, i) => {
      const ratio = w.completed / TARGET_DAYS;
      let level = 0;
      if (ratio >= 1) level = 4;
      else if (ratio >= 0.75) level = 3;
      else if (ratio >= 0.5) level = 2;
      else if (ratio > 0) level = 1;

      return `<div class="consistency-cell-group">
        <div class="consistency-cell level-${level}" title="Week ${i + 1}: ${w.completed}/${TARGET_DAYS} sessions">
          <span class="cell-count">${w.completed}</span>
        </div>
        <div class="consistency-cell-label">W${i + 1}</div>
      </div>`;
    }).join('');

    // Streak: consecutive calendar weeks (from most recent) hitting target
    const streakEl = document.getElementById('consistencyStreak');
    let streak = 0;
    for (let i = weekData.length - 1; i >= 0; i--) {
      if (weekData[i].completed >= TARGET_DAYS) {
        streak++;
      } else {
        break;
      }
    }

    let streakHtml = '';
    if (streak > 0) {
      const msgs = ['Keep it up!', 'On fire!', 'Unstoppable!', 'Beast mode!', 'Legendary consistency!'];
      const msgIdx = Math.min(streak - 1, msgs.length - 1);
      streakHtml = `<span class="streak-fire">\u{1F525}</span> ${streak} week${streak !== 1 ? 's' : ''} consistent <span class="streak-msg">${msgs[msgIdx]}</span>`;
    }

    if (streakHtml) {
      streakEl.innerHTML = streakHtml;
      streakEl.style.display = '';
    } else {
      streakEl.style.display = 'none';
    }
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

    for (const week of workouts.weeks) {
      for (const day of week.days) {
        for (const ex of day.exercises) {
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
            weekLabel: week.label
          });
        }
      }
    }

    // Also collect individual exercise variants
    for (const week of workouts.weeks) {
      for (const day of week.days) {
        for (const ex of day.exercises) {
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
              weekLabel: week.label
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
      `<button class="lift-pill ${name === this.selectedLift ? 'active' : ''}" data-lift="${Utils.escapeHtml(name)}">${Utils.escapeHtml(name)}</button>`
    ).join('');

    container.querySelectorAll('.lift-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        this.selectedLift = pill.dataset.lift;
        this.renderLiftSelector();
        this.renderCharts();
        this.renderStats();
        this.renderHistory();
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
      reps: e.reps
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
      reps: e.reps
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

      this._showChartTooltip(canvas, points[nearestIdx], data[nearestIdx], options);
    };

    canvas.addEventListener('click', canvas._chartTapHandler);
  },

  _showChartTooltip(canvas, point, dataPoint, options) {
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

    // Add indicator line on canvas
    this._drawIndicatorLine(canvas, point);

    // Auto-dismiss after 4s
    canvas._tooltipTimer = setTimeout(() => this._dismissTooltip(canvas), 4000);
  },

  _drawIndicatorLine(canvas, point) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
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

  renderHistory() {
    const entries = this.liftData[this.selectedLift];
    if (!entries || entries.length === 0) return;

    const container = document.getElementById('historyTable');
    const recent = [...entries].reverse().slice(0, 10);

    container.innerHTML = `
      <div class="history-row header">
        <span>Date</span>
        <span>Weight</span>
        <span>Sets x Reps</span>
        <span style="text-align:right">Volume</span>
      </div>
      ${recent.map(e => `
        <div class="history-row">
          <span class="date">${e.weekLabel || e.date || '--'}</span>
          <span class="weight">${Utils.formatWeight(e.weight)}</span>
          <span class="sets-reps">${e.sets} x ${e.reps}</span>
          <span class="volume">${Math.round(e.volume)}</span>
        </div>
      `).join('')}
    `;
  },

  // --- Strength Calculators ---
  initCalculators() {
    // Toggle collapsible
    const toggle = document.getElementById('calcToggle');
    const body = document.getElementById('calcBody');
    if (toggle && body) {
      toggle.addEventListener('click', () => {
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : '';
        toggle.classList.toggle('open', !open);
      });
    }

    // 1RM Calculator
    const calcOneRm = document.getElementById('calcOneRm');
    if (calcOneRm) {
      calcOneRm.addEventListener('click', () => {
        const weight = parseFloat(document.getElementById('oneRmWeight').value);
        const reps = parseInt(document.getElementById('oneRmReps').value);
        if (!weight || !reps || reps < 1) {
          Toast.show('Enter weight and reps');
          return;
        }
        const result = this.calculateOneRm(weight, reps);
        const resultEl = document.getElementById('oneRmResult');
        resultEl.style.display = '';
        resultEl.innerHTML = `
          <div class="calc-result-label">Estimated 1RM</div>
          <div class="calc-result-value">${Utils.formatWeight(result.average)}kg</div>
          <div class="calc-result-detail">
            Epley: ${Utils.formatWeight(result.epley)}kg · Brzycki: ${Utils.formatWeight(result.brzycki)}kg
          </div>
        `;
        Haptics.light();
      });
    }

    // DOTS Gender toggle
    const genderToggle = document.getElementById('dotsGender');
    if (genderToggle) {
      genderToggle.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn) return;
        genderToggle.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    }

    // DOTS Calculator — prefill body weight from localStorage
    const dotsBodyWeight = document.getElementById('dotsBodyWeight');
    if (dotsBodyWeight) {
      const savedBw = Storage.get('barbellPro_bodyWeight');
      const savedUnit = Storage.get('barbellPro_bodyWeightUnit') || 'kg';
      if (savedBw) {
        // Always show in kg for DOTS
        dotsBodyWeight.value = savedUnit === 'lb' ? Utils.lbToKg(savedBw) : savedBw;
      }

      // Auto-save body weight when user types it (replaces old Settings modal save)
      dotsBodyWeight.addEventListener('change', () => {
        const val = parseFloat(dotsBodyWeight.value);
        if (!isNaN(val) && val > 0) {
          Storage.set('barbellPro_bodyWeight', val);
          Storage.set('barbellPro_bodyWeightUnit', 'kg');
        }
      });
    }

    const calcDots = document.getElementById('calcDots');
    if (calcDots) {
      calcDots.addEventListener('click', () => {
        const liftWeight = parseFloat(document.getElementById('dotsLiftWeight').value);
        const bodyWeight = parseFloat(document.getElementById('dotsBodyWeight').value);
        const gender = document.querySelector('#dotsGender button.active').dataset.gender;
        if (!liftWeight || !bodyWeight) {
          Toast.show('Enter lift weight and body weight');
          return;
        }
        const dots = this.calculateDOTS(liftWeight, bodyWeight, gender);
        const resultEl = document.getElementById('dotsResult');
        resultEl.style.display = '';
        resultEl.innerHTML = `
          <div class="calc-result-label">DOTS Score</div>
          <div class="calc-result-value">${dots.toFixed(1)}</div>
          <div class="calc-result-detail">
            ${liftWeight}kg lift at ${bodyWeight}kg body weight (${gender})
          </div>
        `;
        Haptics.light();
      });
    }
  },

  calculateOneRm(weight, reps) {
    if (reps === 1) return { epley: weight, brzycki: weight, average: weight };
    const epley = weight * (1 + reps / 30);
    const brzycki = weight * 36 / (37 - reps);
    const average = (epley + brzycki) / 2;
    return {
      epley: Math.round(epley * 10) / 10,
      brzycki: Math.round(brzycki * 10) / 10,
      average: Math.round(average * 10) / 10
    };
  },

  calculateDOTS(liftWeight, bodyWeight, gender) {
    // DOTS coefficients
    const maleCoeffs = [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093];
    const femaleCoeffs = [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706];
    const coeffs = gender === 'female' ? femaleCoeffs : maleCoeffs;

    const bw = bodyWeight;
    const denominator = coeffs[0] + coeffs[1] * bw + coeffs[2] * Math.pow(bw, 2)
      + coeffs[3] * Math.pow(bw, 3) + coeffs[4] * Math.pow(bw, 4);
    if (denominator === 0 || !isFinite(denominator)) return 0;
    const dots = (500 / denominator) * liftWeight;
    return isFinite(dots) ? Math.max(0, dots) : 0;
  }
};
