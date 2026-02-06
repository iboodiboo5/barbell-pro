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

    // Initialize modules
    Calculator.init();
    Tracker.init();
    Notes.init();
    Analytics.init();
  },

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('SW registration failed:', err);
      });
    }
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
