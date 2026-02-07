/* ============================================
   KK BARBELL - App Shell & Utilities
   ============================================ */

// --- Storage Utility ---
const Storage = {
  get(key) {
    try {
      const val = localStorage.getItem(key);
      return val ? JSON.parse(val) : null;
    } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.warn('Storage write failed:', e); }
  },
  remove(key) {
    try { localStorage.removeItem(key); }
    catch {}
  }
};

// --- Toast Notifications ---
const Toast = {
  show(message, duration = 3000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('out');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }
};

// --- Utility Functions ---
const Utils = {
  kgToLb(kg) { return +(kg * 2.20462).toFixed(2); },
  lbToKg(lb) { return +(lb / 2.20462).toFixed(2); },

  formatWeight(value) {
    if (Number.isInteger(value)) return value.toString();
    const rounded = +value.toFixed(2);
    if (rounded === Math.floor(rounded)) return Math.floor(rounded).toString();
    return rounded.toString();
  },

  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
  },

  escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

// --- Haptic Feedback ---
const Haptics = {
  _enabled: true,

  init() {
    const saved = Storage.get('barbellPro_haptics');
    this._enabled = saved !== false;
  },

  get enabled() { return this._enabled; },
  set enabled(val) {
    this._enabled = val;
    Storage.set('barbellPro_haptics', val);
  },

  _vibrate(pattern) {
    if (!this._enabled) return;
    if (navigator.vibrate) navigator.vibrate(pattern);
  },

  light()     { this._vibrate(10); },
  success()   { this._vibrate(20); },
  warning()   { this._vibrate([10, 40, 10]); },
  longPress() { this._vibrate(50); }
};

// --- Sound System (Web Audio API) ---
const Sound = {
  _ctx: null,
  _enabled: true,

  init() {
    const saved = Storage.get('barbellPro_sound');
    this._enabled = saved !== false;

    // Persistent listener to resume AudioContext on any user gesture (iOS requirement)
    const resumeAudio = () => {
      if (this._ctx && this._ctx.state === 'suspended') {
        try { this._ctx.resume(); } catch (e) { /* ignore */ }
      }
    };
    document.addEventListener('touchstart', resumeAudio, { passive: true });
    document.addEventListener('touchend', resumeAudio, { passive: true });
    document.addEventListener('click', resumeAudio);
  },

  get enabled() { return this._enabled; },
  set enabled(val) {
    this._enabled = val;
    Storage.set('barbellPro_sound', val);
  },

  _ensureContext() {
    if (this._ctx) {
      if (this._ctx.state === 'suspended') {
        try { this._ctx.resume(); } catch (e) { /* ignore */ }
      }
      return this._ctx;
    }
    try {
      this._ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return null;
    }
    return this._ctx;
  },

  warmUp() {
    // Always try to create/resume context (no _initialized guard — iOS needs repeated attempts)
    this._ensureContext();
  },

  _play(frequency, duration, type, volume, ramp) {
    if (!this._enabled) return;
    // Always try to resume on play (iOS suspends aggressively)
    if (this._ctx && this._ctx.state === 'suspended') {
      try { this._ctx.resume(); } catch (e) { /* ignore */ }
    }
    const ctx = this._ensureContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    if (ramp) {
      osc.frequency.linearRampToValueAtTime(ramp, ctx.currentTime + duration);
    }

    const vol = volume || 0.08;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  },

  // --- Sound Presets ---
  tabClick() {
    this._play(1200, 0.05, 'sine', 0.06);
  },

  exerciseComplete() {
    this._play(523, 0.08, 'sine', 0.10);
    setTimeout(() => this._play(659, 0.1, 'sine', 0.08), 80);
  },

  exerciseUncomplete() {
    this._play(659, 0.1, 'sine', 0.06, 523);
  },

  importSuccess() {
    this._play(784, 0.15, 'sine', 0.12);
    setTimeout(() => this._play(1047, 0.12, 'sine', 0.06), 100);
  },

  delete() {
    this._play(150, 0.1, 'triangle', 0.10);
  },

  plateAdd() {
    this._play(900, 0.04, 'triangle', 0.08);
  }
};

// --- Settings ---
const Settings = {
  init() {
    this.bindEvents();
    this.syncToggles();
  },

  bindEvents() {
    document.getElementById('settingsBtn').addEventListener('click', () => this.open());
    document.getElementById('closeSettings').addEventListener('click', () => this.close());
    document.getElementById('settingsModal').addEventListener('click', e => {
      if (e.target === e.currentTarget) this.close();
    });

    document.getElementById('soundToggle').addEventListener('click', () => {
      Sound.enabled = !Sound.enabled;
      this.syncToggles();
      Haptics.light();
    });

    document.getElementById('vibrationToggle').addEventListener('click', () => {
      Haptics.enabled = !Haptics.enabled;
      this.syncToggles();
    });

    // Body weight input
    const bwInput = document.getElementById('bodyWeightInput');
    const bwToggle = document.getElementById('bwUnitToggle');

    bwInput.addEventListener('change', () => {
      const val = parseFloat(bwInput.value);
      if (!isNaN(val) && val > 0) {
        Storage.set('barbellPro_bodyWeight', val);
      }
    });

    bwToggle.addEventListener('click', () => {
      const currentUnit = Storage.get('barbellPro_bodyWeightUnit') || 'kg';
      const newUnit = currentUnit === 'kg' ? 'lb' : 'kg';
      Storage.set('barbellPro_bodyWeightUnit', newUnit);
      bwToggle.textContent = newUnit;

      // Convert displayed value
      const val = parseFloat(bwInput.value);
      if (!isNaN(val) && val > 0) {
        const converted = newUnit === 'lb' ? Utils.kgToLb(val) : Utils.lbToKg(val);
        bwInput.value = Math.round(converted * 10) / 10;
        Storage.set('barbellPro_bodyWeight', parseFloat(bwInput.value));
      }
    });
  },

  syncToggles() {
    const soundBtn = document.getElementById('soundToggle');
    const vibBtn = document.getElementById('vibrationToggle');
    soundBtn.classList.toggle('active', Sound.enabled);
    soundBtn.setAttribute('aria-checked', String(Sound.enabled));
    vibBtn.classList.toggle('active', Haptics.enabled);
    vibBtn.setAttribute('aria-checked', String(Haptics.enabled));

    // Sync body weight
    const bwInput = document.getElementById('bodyWeightInput');
    const bwToggle = document.getElementById('bwUnitToggle');
    const savedBw = Storage.get('barbellPro_bodyWeight');
    const savedUnit = Storage.get('barbellPro_bodyWeightUnit') || 'kg';
    if (savedBw) bwInput.value = savedBw;
    bwToggle.textContent = savedUnit;
  },

  open() {
    document.getElementById('settingsModal').classList.add('active');
    Haptics.light();
    Sound.tabClick();
  },

  close() {
    const overlay = document.getElementById('settingsModal');
    overlay.classList.add('closing');
    setTimeout(() => overlay.classList.remove('active', 'closing'), 250);
  }
};

// --- Shared Constants ---
const LIFT_GROUPS = {
  'Bench Press': ['bench press', 'pause bench press', 'spoto bench press', 'flat bench'],
  'Incline Press': ['incline', 'med incline db bench press', 'incline db bench', 'incline bench'],
  'Deadlift': ['deadlift', 'conventional deadlift', 'sumo deadlift'],
  'Squat': ['squat', 'high bar squat', 'back squat', 'hack squat', 'hack squart'],
  'Overhead Press': ['ohp', 'overhead press', 'military press', 'shoulder press', 'btn press'],
  'Row': ['row', 'barbell row', 'chest supported row', 'pendlay row'],
  'Chin Up': ['chin up', 'assisted chin up', 'pull up', 'lat pulldown']
};

// Barbell compound lifts only (for gold highlighting in tracker)
const BARBELL_COMPOUNDS = ['Bench Press', 'Deadlift', 'Squat', 'Overhead Press', 'Row'];

// --- Notes Module ---
const Notes = {
  init() {
    const textarea = document.getElementById('notesTextarea');
    const saved = Storage.get('barbellPro_notes');
    if (saved) textarea.value = saved;

    // Auto-save on input with debounce
    let saveTimeout;
    textarea.addEventListener('input', () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        Storage.set('barbellPro_notes', textarea.value);
        this.showSaved();
      }, 500);
    });

    // Also save on blur (immediate)
    textarea.addEventListener('blur', () => {
      Storage.set('barbellPro_notes', textarea.value);
    });
  },

  showSaved() {
    const status = document.getElementById('notesStatus');
    status.textContent = 'Saved';
    status.classList.add('visible');
    setTimeout(() => status.classList.remove('visible'), 1500);
  }
};

// --- Tab Navigation ---
const App = {
  currentTab: 'tracker',

  init() {
    this.registerServiceWorker();
    this.requestPersistentStorage();
    this.setupTabNavigation();

    // Initialize feedback systems
    Haptics.init();
    Sound.init();

    // Warm up AudioContext on user interaction (iOS resumes need repeated attempts)
    document.addEventListener('click', () => Sound.warmUp());
    document.addEventListener('touchstart', () => Sound.warmUp(), { passive: true });

    // Initialize modules
    Calculator.init();
    Tracker.init();
    Notes.init();
    Analytics.init();
    Settings.init();
  },

  registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('./sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.showUpdateBanner(newWorker);
          }
        });
      });
    }).catch(err => {
      console.warn('SW registration failed:', err);
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  },

  showUpdateBanner(worker) {
    const banner = document.createElement('div');
    banner.className = 'update-banner';
    banner.innerHTML = `
      <span>New version available</span>
      <button class="update-btn">Update</button>
    `;
    document.body.appendChild(banner);

    banner.querySelector('.update-btn').addEventListener('click', () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
      banner.remove();
    });
  },

  requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist();
    }
  },

  setupTabNavigation() {
    const tabBar = document.querySelector('.tab-bar');
    tabBar.addEventListener('click', e => {
      const btn = e.target.closest('.tab-btn');
      if (!btn) return;
      const tab = btn.dataset.tab;
      if (tab === this.currentTab) return;
      this.switchTab(tab);
    });
  },

  switchTab(tabName) {
    Haptics.light();
    Sound.tabClick();

    // Update buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });

    // Update content
    document.querySelectorAll('.tab-content').forEach(section => {
      section.classList.remove('active');
    });
    const target = document.getElementById('tab-' + tabName);
    if (target) {
      target.classList.add('active');
      // Re-trigger animation
      target.style.animation = 'none';
      target.offsetHeight; // force reflow
      target.style.animation = '';
    }

    this.currentTab = tabName;

    // Notify analytics to refresh charts if switching to it
    if (tabName === 'analytics') {
      Analytics.refresh();
    }
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
