/* ============================================
   KK BARBELL - Lift Analytics Module
   ============================================ */

// LIFT_GROUPS is defined in app.js (shared constant)

const Analytics = {
  selectedLift: null,
  liftData: {},

  init() {
    // Will be populated on refresh
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

  renderConsistency() {
    const section = document.getElementById('consistencySection');
    const workouts = Storage.get('barbellPro_workouts');

    if (!workouts || !workouts.weeks || workouts.weeks.length === 0) {
      section.style.display = 'none';
      return;
    }

    section.style.display = '';
    const weeks = workouts.weeks;

    // Helper: get the first non-empty date from a week's days
    const getWeekDate = (week) => {
      for (const day of week.days) {
        if (day.date && day.date.trim()) return day.date.trim();
      }
      return null;
    };

    // Auto-detect program start date from Week 1
    const startDateStr = getWeekDate(weeks[0]);
    const startDate = startDateStr ? new Date(startDateStr) : null;

    // Build week data with dynamic targets
    const weekData = weeks.map((week, i) => {
      const plannedDays = week.days.filter(d => d.exercises && d.exercises.length > 0);
      const totalPlanned = plannedDays.length;
      const totalCompleted = plannedDays.filter(d =>
        d.exercises.some(ex => ex.completed)
      ).length;

      // Date-based timing check
      let onTime = true; // default: assume on-time if no dates
      const actualDateStr = getWeekDate(week);
      if (startDate && actualDateStr && i > 0) {
        const expectedStart = new Date(startDate);
        expectedStart.setDate(expectedStart.getDate() + (i * 7));
        const expectedEnd = new Date(expectedStart);
        expectedEnd.setDate(expectedEnd.getDate() + 6);
        const actualDate = new Date(actualDateStr);
        onTime = actualDate <= expectedEnd;
      }

      return {
        label: week.label,
        planned: totalPlanned,
        completed: totalCompleted,
        onTime
      };
    });

    // Overall completion rate (days completed / days planned)
    const totalPlanned = weekData.reduce((sum, w) => sum + w.planned, 0);
    const totalCompleted = weekData.reduce((sum, w) => sum + w.completed, 0);
    const completionRate = totalPlanned > 0 ? Math.round((totalCompleted / totalPlanned) * 100) : 0;

    // Count late weeks for display
    const lateWeeks = weekData.filter(w => !w.onTime && w.planned > 0).length;

    const rateEl = document.getElementById('consistencyRate');
    rateEl.textContent = completionRate + '%';
    rateEl.className = 'consistency-rate';
    if (completionRate >= 90 && lateWeeks === 0) rateEl.classList.add('rate-green');
    else if (completionRate >= 70) rateEl.classList.add('rate-gold');
    else rateEl.classList.add('rate-red');

    // Heatmap grid — per-week cell
    const grid = document.getElementById('consistencyGrid');
    grid.innerHTML = weekData.map((w, i) => {
      const ratio = w.planned > 0 ? w.completed / w.planned : 0;
      let level = 0;
      if (ratio >= 1) level = 4;
      else if (ratio >= 0.75) level = 3;
      else if (ratio >= 0.5) level = 2;
      else if (ratio > 0) level = 1;

      // Late weeks get a red border indicator
      const lateClass = (!w.onTime && w.planned > 0) ? ' late' : '';
      const timeStatus = w.onTime ? 'on time' : 'late';

      return `<div class="consistency-cell-group">
        <div class="consistency-cell level-${level}${lateClass}" title="${w.label}: ${w.completed}/${w.planned} days (${timeStatus})">
          <span class="cell-count">${w.completed}</span>
        </div>
        <div class="consistency-cell-label">W${i + 1}</div>
      </div>`;
    }).join('');

    // Streak: consecutive weeks (from most recent) fully completed AND on time
    const streakEl = document.getElementById('consistencyStreak');
    let streak = 0;
    for (let i = weekData.length - 1; i >= 0; i--) {
      if (weekData[i].planned === 0) continue;
      if (weekData[i].completed >= weekData[i].planned && weekData[i].onTime) {
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

    // Add late warning if applicable
    if (lateWeeks > 0) {
      streakHtml += `${streakHtml ? '<br>' : ''}<span class="streak-late">\u26A0\uFE0F ${lateWeeks} week${lateWeeks !== 1 ? 's' : ''} behind schedule</span>`;
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
    const lifts = Object.keys(this.liftData);

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
      label: e.weekLabel || e.date || ('Session ' + (i + 1))
    }));
    this.drawLineChart(progressionCanvas, progressionData, {
      color: '#e94560',
      fillColor: 'rgba(233, 69, 96, 0.1)',
      yLabel: 'Weight',
      dotColor: '#e94560'
    });

    // Volume chart
    const volumeCanvas = document.getElementById('volumeChart');
    const volumeData = entries.filter(e => e.volume > 0).map((e, i) => ({
      x: i,
      y: e.volume,
      label: e.weekLabel || e.date || ('Session ' + (i + 1))
    }));
    if (volumeData.length > 0) {
      this.drawLineChart(volumeCanvas, volumeData, {
        color: '#3498db',
        fillColor: 'rgba(52, 152, 219, 0.1)',
        yLabel: 'Volume',
        dotColor: '#3498db'
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
      // Truncate label
      const shortLabel = label.length > 8 ? label.substring(0, 8) : label;
      ctx.fillText(shortLabel, x, h - pad.bottom + 18);
    }

    if (data.length === 1) {
      // Single point - just draw a dot
      const x = pad.left + chartW / 2;
      const y = pad.top + chartH / 2;
      ctx.fillStyle = options.dotColor || '#e94560';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
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

      // White ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
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
  }
};
