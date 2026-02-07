/* ============================================
   KK BARBELL - Calculator Module (Mixed Plates)
   ============================================ */

const PLATES = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5]
};

const BAR_WEIGHTS_KG = [20, 15, 10];

const PLATE_COLORS = {
  // KG
  25: '#e94560', 20: '#3498db', 15: '#f0c040', 10: '#2ecc71',
  5: '#e67e22', 2.5: '#9b59b6', 1.25: '#95a5a6',
  // LB
  45: '#e94560', 35: '#3498db'
};

function getPlateColor(weight, unit) {
  if (unit === 'kg' && PLATE_COLORS[weight]) return PLATE_COLORS[weight];
  if (unit === 'lb') {
    if (weight === 45) return '#e94560';
    if (weight === 35) return '#3498db';
    if (weight === 25) return '#f0c040';
    if (weight === 10) return '#2ecc71';
    if (weight === 5) return '#e67e22';
    if (weight === 2.5) return '#9b59b6';
  }
  if (PLATE_COLORS[weight]) return PLATE_COLORS[weight];
  return '#95a5a6';
}

function getPlateHeight(weight, unit) {
  // Convert to kg-equivalent for consistent sizing
  const kgEq = unit === 'lb' ? Utils.lbToKg(weight) : weight;
  if (kgEq >= 23) return 84;
  if (kgEq >= 18) return 76;
  if (kgEq >= 13) return 66;
  if (kgEq >= 8) return 56;
  if (kgEq >= 4) return 46;
  if (kgEq >= 2) return 38;
  return 30;
}

const Calculator = {
  state: {
    displayUnit: 'kg',
    barWeight: 20,     // always in kg
    plates: [],        // {weight: number, unit: 'kg'|'lb'}[]
    history: []        // {weight, unit}[][]
  },

  init() {
    this.loadState();
    this.renderPlateButtons();
    this.renderBarbell();
    this.updateDisplay();
    this.renderBarWeightOptions();
    this.bindEvents();

    if (this.state.plates.length > 0) {
      Toast.show('Previous session restored');
    }
  },

  loadState() {
    const saved = Storage.get('barbellPro_calculator');
    if (saved) {
      // Migrate old format: 'unit' → 'displayUnit'
      if (saved.unit && !saved.displayUnit) {
        saved.displayUnit = saved.unit;
        delete saved.unit;
      }
      // Migrate old plates format: number[] → {weight, unit}[]
      if (saved.plates && saved.plates.length > 0 && typeof saved.plates[0] === 'number') {
        const oldUnit = saved.displayUnit || 'kg';
        saved.plates = saved.plates.map(w => ({ weight: w, unit: oldUnit }));
      }
      // Migrate history entries
      if (saved.history) {
        saved.history = saved.history.map(entry => {
          if (Array.isArray(entry) && entry.length > 0 && typeof entry[0] === 'number') {
            const oldUnit = saved.displayUnit || 'kg';
            return entry.map(w => ({ weight: w, unit: oldUnit }));
          }
          return entry;
        });
      }
      this.state = { ...this.state, ...saved };
      if (!this.state.history) this.state.history = [];
      // Validate barWeight against allowed values
      if (!BAR_WEIGHTS_KG.includes(this.state.barWeight)) this.state.barWeight = 20;
      // Display toggle removed — always kg primary
      this.state.displayUnit = 'kg';
    }
  },

  saveState() {
    Storage.set('barbellPro_calculator', {
      barWeight: this.state.barWeight,
      plates: this.state.plates,
      history: this.state.history
    });
  },

  bindEvents() {
    // Plate buttons (event delegation)
    document.getElementById('plateButtons').addEventListener('click', e => {
      const btn = e.target.closest('.plate-btn');
      if (!btn) return;
      const weight = parseFloat(btn.dataset.weight);
      const unit = btn.dataset.unit || 'kg';
      if (!isNaN(weight)) this.addPlate(weight, unit);
    });

    // Undo
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());

    // Clear
    document.getElementById('clearBtn').addEventListener('click', () => this.clearAll());

  },

  addPlate(weight, unit) {
    this.state.history.push(this.state.plates.map(p => ({ ...p })));
    this.state.plates.push({ weight, unit });
    this.saveState();
    this.renderBarbell();
    this.updateDisplay();
    Haptics.light();
    Sound.plateAdd();
  },

  removePlate(sortedIndex) {
    this.state.history.push(this.state.plates.map(p => ({ ...p })));
    const sorted = this.getSortedPlatesWithIndices();
    const actualIndex = sorted[sortedIndex].originalIndex;
    this.state.plates.splice(actualIndex, 1);
    this.saveState();
    this.renderBarbell();
    this.updateDisplay();
  },

  getSortedPlatesWithIndices() {
    return this.state.plates
      .map((plate, i) => ({
        ...plate,
        originalIndex: i,
        weightKg: plate.unit === 'lb' ? Utils.lbToKg(plate.weight) : plate.weight
      }))
      .sort((a, b) => b.weightKg - a.weightKg);
  },

  undo() {
    if (this.state.history.length === 0) return;
    this.state.plates = this.state.history.pop();
    this.saveState();
    this.renderBarbell();
    this.updateDisplay();
  },

  clearAll() {
    if (this.state.plates.length === 0) return;
    this.state.history.push(this.state.plates.map(p => ({ ...p })));
    this.state.plates = [];
    this.saveState();
    this.renderBarbell();
    this.updateDisplay();
    Haptics.warning();
    Sound.delete();
  },

  // Returns total weight in KG
  getTotalWeightKg() {
    let plateSumKg = 0;
    for (const plate of this.state.plates) {
      plateSumKg += plate.unit === 'lb' ? Utils.lbToKg(plate.weight) : plate.weight;
    }
    return this.state.barWeight + (plateSumKg * 2);
  },

  // Returns per-side weight in KG
  getPerSideWeightKg() {
    let sumKg = 0;
    for (const plate of this.state.plates) {
      sumKg += plate.unit === 'lb' ? Utils.lbToKg(plate.weight) : plate.weight;
    }
    return sumKg;
  },

  setBarWeight(weight) {
    this.state.barWeight = weight;
    this.saveState();
    this.renderBarWeightOptions();
    this.updateDisplay();
  },

  renderPlateButtons() {
    const container = document.getElementById('plateButtons');

    const kgHtml = `<div class="plate-section-label">KG PLATES</div>
      <div class="plate-buttons-row">
        ${PLATES.kg.map(w => {
          const color = getPlateColor(w, 'kg');
          return `<button class="plate-btn" data-weight="${w}" data-unit="kg">
            <span class="plate-btn-bar" style="background:${color}"></span>
            ${w}<span class="plate-unit">KG</span>
          </button>`;
        }).join('')}
      </div>`;

    const lbHtml = `<div class="plate-section-label">LB PLATES</div>
      <div class="plate-buttons-row">
        ${PLATES.lb.map(w => {
          const color = getPlateColor(w, 'lb');
          return `<button class="plate-btn" data-weight="${w}" data-unit="lb">
            <span class="plate-btn-bar" style="background:${color}"></span>
            ${w}<span class="plate-unit">LB</span>
          </button>`;
        }).join('')}
      </div>`;

    container.innerHTML = kgHtml + lbHtml;
  },

  renderBarWeightOptions() {
    const container = document.getElementById('barWeightOptions');

    container.innerHTML = BAR_WEIGHTS_KG.map(w =>
      `<button class="bar-weight-btn ${w === this.state.barWeight ? 'active' : ''}" data-bw="${w}">${w}kg</button>`
    ).join('');

    container.querySelectorAll('.bar-weight-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.setBarWeight(parseFloat(btn.dataset.bw));
      });
    });
  },

  renderBarbell() {
    const sorted = this.getSortedPlatesWithIndices();
    const leftContainer = document.getElementById('platesLeft');
    const rightContainer = document.getElementById('platesRight');

    leftContainer.innerHTML = '';
    rightContainer.innerHTML = '';

    sorted.forEach((plate, i) => {
      leftContainer.appendChild(this.createPlateElement(plate, i));
      rightContainer.appendChild(this.createPlateElement(plate, i));
    });
  },

  createPlateElement(plate, index) {
    const el = document.createElement('div');
    el.className = 'plate';
    const color = getPlateColor(plate.weight, plate.unit);
    const height = getPlateHeight(plate.weight, plate.unit);
    const width = this.getPlateWidth(plate.weight, plate.unit);
    el.style.height = height + 'px';
    el.style.width = width + 'px';
    el.style.background = color;

    if (color === '#f0c040') el.style.color = '#333';

    // Show unit suffix for LB plates to distinguish from KG
    el.textContent = plate.unit === 'lb' ? plate.weight + 'lb' : plate.weight;
    el.addEventListener('click', () => this.removePlate(index));
    return el;
  },

  getPlateWidth(weight, unit) {
    const kgEq = unit === 'lb' ? Utils.lbToKg(weight) : weight;
    if (kgEq >= 10) return 16;      // 10kg+ / 25lb+ → 16px (standard)
    if (kgEq >= 4) return 14;       // 5kg / 10lb → 14px (slightly thinner)
    return 12;                       // 2.5kg, 1.25kg / 5lb, 2.5lb → 12px (thinnest)
  },

  updateDisplay() {
    const totalKg = this.getTotalWeightKg();
    const totalLb = Utils.kgToLb(totalKg);
    const perSideKg = this.getPerSideWeightKg();
    const plateCount = this.state.plates.length;

    // Main display — always KG
    document.getElementById('totalWeight').textContent = Utils.formatWeight(totalKg);
    document.getElementById('unitLabel').textContent = 'KG';

    // Secondary display — always LB
    const lbEl = document.getElementById('totalWeightLb');
    if (lbEl) lbEl.textContent = Utils.formatWeight(totalLb);

    // Simplified breakdown
    const breakdown = plateCount > 0
      ? `Bar: ${this.state.barWeight}kg  \u00B7  ${Utils.formatWeight(perSideKg)}kg per side`
      : `Bar: ${this.state.barWeight}kg`;
    document.getElementById('weightBreakdown').textContent = breakdown;

    // Undo button state
    document.getElementById('undoBtn').disabled = this.state.history.length === 0;
  }
};
