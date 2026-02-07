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
  },

  timerComplete() {
    // Triple ascending beep — C5, E5, G5
    this._play(523, 0.12, 'sine', 0.15);
    setTimeout(() => this._play(659, 0.12, 'sine', 0.15), 150);
    setTimeout(() => this._play(784, 0.18, 'sine', 0.18), 300);
  }
};

// --- Rest Timer ---
const RestTimer = {
  _endTime: null,
  _duration: 0,
  _intervalId: null,
  _rafId: null,
  _isRunning: false,
  _isExpanded: false,
  _notificationPermission: false,
  _dismissTimer: null,

  PRESETS: [
    { label: '2:00', seconds: 120 },  // "Last" — updated from localStorage
    { label: '1:00', seconds: 60 },
    { label: '2:00', seconds: 120 },
    { label: '2:30', seconds: 150 },
    { label: '3:00', seconds: 180 },
    { label: '5:00', seconds: 300 }
  ],

  init() {
    // Load last-used preset
    const saved = Storage.get('barbellPro_lastRestTime');
    if (saved && saved > 0) {
      this.PRESETS[0].seconds = saved;
      this.PRESETS[0].label = this.formatTime(saved);
    }

    // Bind timer button
    document.getElementById('timerBtn').addEventListener('click', () => {
      Haptics.light();
      this.expand();
    });

    // Bind pill tap → expand
    document.getElementById('restPill').addEventListener('click', () => this.expand());

    // Bind overlay dismiss (tap outside ring)
    document.getElementById('timerOverlay').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.collapse();
    });

    // Bind stop button
    document.getElementById('timerStopBtn').addEventListener('click', (e) => {
      e.stopPropagation();
      this.stop();
    });

    // Swipe-down to collapse
    this._setupSwipeDown();

    // Check notification permission
    if ('Notification' in window && Notification.permission === 'granted') {
      this._notificationPermission = true;
    }
  },

  formatTime(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ':' + String(s).padStart(2, '0');
  },

  start(seconds) {
    // Clear any existing timer
    this._clearTimers();

    // Save as last-used
    Storage.set('barbellPro_lastRestTime', seconds);
    this.PRESETS[0].seconds = seconds;
    this.PRESETS[0].label = this.formatTime(seconds);

    this._duration = seconds;
    this._endTime = Date.now() + (seconds * 1000);
    this._isRunning = true;

    // Show pill
    const pill = document.getElementById('restPill');
    pill.style.display = '';
    pill.classList.remove('leaving', 'complete');
    pill.classList.add('entering');
    pill.addEventListener('animationend', () => pill.classList.remove('entering'), { once: true });

    // Show timer button indicator
    document.getElementById('timerBtn').classList.add('running');
    document.getElementById('timerBtnDot').classList.add('active');

    // Reset pill progress
    document.getElementById('restPillProgress').style.width = '100%';

    // Request notification permission on first timer start
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(p => {
        this._notificationPermission = (p === 'granted');
      });
    }

    // Start tick loop
    this._tick();

    // Backup interval for completion detection
    this._intervalId = setInterval(() => {
      if (Date.now() >= this._endTime && this._isRunning) {
        this.complete();
      }
    }, 1000);

    Haptics.light();
    Sound.tabClick();
  },

  stop() {
    this._clearTimers();
    this._isRunning = false;

    // Hide pill
    const pill = document.getElementById('restPill');
    pill.classList.remove('complete', 'entering');
    pill.classList.add('leaving');
    pill.addEventListener('animationend', () => {
      pill.style.display = 'none';
      pill.classList.remove('leaving');
    }, { once: true });

    // Remove timer button indicator
    document.getElementById('timerBtn').classList.remove('running');
    document.getElementById('timerBtnDot').classList.remove('active');

    // Close overlay if expanded
    if (this._isExpanded) this.collapse();

    Haptics.light();
    Sound.delete();
  },

  _clearTimers() {
    if (this._intervalId) {
      clearInterval(this._intervalId);
      this._intervalId = null;
    }
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._dismissTimer) {
      clearTimeout(this._dismissTimer);
      this._dismissTimer = null;
    }
  },

  _tick() {
    if (!this._isRunning) return;

    const remaining = Math.max(0, Math.ceil((this._endTime - Date.now()) / 1000));

    this._updatePill(remaining);
    if (this._isExpanded) {
      this._updateRing(remaining, this._duration);
    }

    if (remaining <= 0) {
      this.complete();
      return;
    }

    this._rafId = requestAnimationFrame(() => this._tick());
  },

  complete() {
    this._isRunning = false;
    this._clearTimers();

    // Sound + haptics
    Sound.timerComplete();
    Haptics.warning();

    // Update pill to "REST OVER"
    const pill = document.getElementById('restPill');
    const pillText = document.getElementById('restPillText');
    const pillProgress = document.getElementById('restPillProgress');
    pillText.textContent = 'REST OVER';
    pillProgress.style.width = '0%';
    pill.classList.add('complete');

    // If expanded, update ring to done
    if (this._isExpanded) {
      document.getElementById('timerRingProgress').classList.add('complete');
      document.getElementById('timerDigits').textContent = 'DONE';
    }

    // Remove timer button running state
    document.getElementById('timerBtn').classList.remove('running');

    // Send notification if backgrounded
    if (document.hidden && this._notificationPermission) {
      try {
        new Notification('Rest Over', {
          body: 'Time to get back to work!',
          tag: 'rest-timer'
        });
      } catch (e) { /* ignore */ }
    }

    // Auto-dismiss after 3 seconds
    this._dismissTimer = setTimeout(() => {
      if (this._isExpanded) this.collapse();

      pill.classList.remove('complete');
      pill.classList.add('leaving');
      pill.addEventListener('animationend', () => {
        pill.style.display = 'none';
        pill.classList.remove('leaving');
      }, { once: true });

      document.getElementById('timerBtnDot').classList.remove('active');
    }, 3000);
  },

  expand() {
    this._isExpanded = true;
    const overlay = document.getElementById('timerOverlay');
    overlay.style.display = 'flex';
    overlay.classList.add('active');
    overlay.classList.remove('closing');

    // Render preset buttons
    this._renderPresets();

    // Sync ring state
    const ring = document.getElementById('timerRingProgress');
    ring.classList.remove('complete');

    if (this._isRunning) {
      const remaining = Math.max(0, Math.ceil((this._endTime - Date.now()) / 1000));
      this._updateRing(remaining, this._duration);
      document.getElementById('timerDigits').textContent = this.formatTime(remaining);
      // Show stop button
      document.getElementById('timerStopBtn').style.display = '';
    } else {
      // Show last-used duration as default (full ring)
      const defaultTime = this.PRESETS[0].seconds;
      document.getElementById('timerDigits').textContent = this.formatTime(defaultTime);
      this._updateRing(defaultTime, defaultTime);
      // Hide stop button when no timer running
      document.getElementById('timerStopBtn').style.display = 'none';
    }

    Haptics.light();
  },

  collapse() {
    this._isExpanded = false;
    const overlay = document.getElementById('timerOverlay');
    overlay.classList.add('closing');

    const onEnd = () => {
      overlay.style.display = 'none';
      overlay.classList.remove('active', 'closing');
      overlay.removeEventListener('animationend', onEnd);
    };
    overlay.addEventListener('animationend', onEnd);

    // Fallback if animation doesn't fire
    setTimeout(onEnd, 350);
  },

  _updatePill(remaining) {
    document.getElementById('restPillText').textContent = this.formatTime(remaining);
    const pct = this._duration > 0 ? (remaining / this._duration) * 100 : 0;
    document.getElementById('restPillProgress').style.width = pct + '%';
  },

  _updateRing(remaining, total) {
    const circumference = 2 * Math.PI * 90; // r=90 → 565.49
    const progress = total > 0 ? 1 - (remaining / total) : 0; // 0→1 as time passes
    const offset = circumference * (1 - progress);
    document.getElementById('timerRingProgress').style.strokeDashoffset = offset;
    document.getElementById('timerDigits').textContent = this.formatTime(remaining);
  },

  _renderPresets() {
    const container = document.getElementById('timerPresets');
    container.innerHTML = this.PRESETS.map((p, i) => {
      const isActive = this._isRunning && this._duration === p.seconds;
      const label = i === 0 ? 'Last: ' + p.label : p.label;
      return `<button class="timer-preset-btn ${isActive ? 'active' : ''}" data-seconds="${p.seconds}" data-index="${i}">${label}</button>`;
    }).join('');

    // Set up delegation once (not on every render)
    if (!container._bound) {
      container._bound = true;
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.timer-preset-btn');
        if (!btn) return;
        const seconds = parseInt(btn.dataset.seconds);
        if (seconds > 0) {
          this.start(seconds);
          // Re-render presets to update active state
          this._renderPresets();
          // Show stop button now that timer is running
          document.getElementById('timerStopBtn').style.display = '';
        }
      });
    }
  },

  _setupSwipeDown() {
    const overlay = document.getElementById('timerOverlay');
    let startY = 0;
    let deltaY = 0;
    let tracking = false;

    overlay.addEventListener('touchstart', (e) => {
      // Only track if touching the overlay background, not buttons/ring
      if (e.target === overlay || e.target.closest('.timer-ring-container')) {
        startY = e.touches[0].clientY;
        tracking = true;
        deltaY = 0;
      }
    }, { passive: true });

    overlay.addEventListener('touchmove', (e) => {
      if (!tracking) return;
      deltaY = e.touches[0].clientY - startY;
      if (deltaY > 0) {
        // Visual feedback: slight translate down
        const container = document.getElementById('timerRingContainer');
        container.style.transform = `translateY(${Math.min(deltaY * 0.3, 40)}px)`;
        container.style.transition = 'none';
      }
    }, { passive: true });

    overlay.addEventListener('touchend', () => {
      if (!tracking) return;
      tracking = false;
      const container = document.getElementById('timerRingContainer');
      container.style.transition = 'transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)';
      container.style.transform = '';

      if (deltaY > 80) {
        this.collapse();
      }
    });
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

    // Copy button
    document.getElementById('notesCopyBtn').addEventListener('click', () => {
      const text = textarea.value;
      if (!text.trim()) {
        Toast.show('Nothing to copy');
        return;
      }
      navigator.clipboard.writeText(text).then(() => {
        Toast.show('Copied to clipboard');
        Haptics.light();
        Sound.tabClick();
      }).catch(() => {
        Toast.show('Copy failed');
      });
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
    RestTimer.init();
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
