import { validateReferenceString, validateFrameCount } from './validation.js';
import { simulate, normalizeAlgorithmKey } from './algorithms.js';
import { SimulatorController } from './simulator.js';
import { ComparisonController } from './comparison.js';
import { LearningController } from './learning.js';
import { RemoteHostBridge, RemoteControllerUI, detectRemoteLaunchParam } from './remote.js';

const VIEW_ORDER = { sim: 0, cmp: 1, learn: 2 };

const PRESET_DEFS = {
  'Standard (13)': { seq: '7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2', frames: 3 },
  'Belady (12)': { seq: '1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5', frames: 3 },
  Locality: { seq: '2, 3, 2, 1, 5, 2, 4, 5, 3, 2, 5, 2', frames: 3 },
  Thrashing: { seq: '0, 1, 2, 3, 4, 5, 6, 7, 0, 1, 2, 3', frames: 3 }
};

class ToastManager {
  constructor() {
    this.el = document.getElementById('toast-popover');
    this.msgEl = document.getElementById('toast-message');
    this.closeBtn = document.getElementById('toast-close');
    this.timerId = null;
    this.remainingMs = 0;
    this.startedAt = 0;
    this.isPaused = false;

    this.closeBtn?.addEventListener('click', () => this.hide());
    this.el?.addEventListener('pointerenter', () => this.pauseTimer());
    this.el?.addEventListener('focusin', () => this.pauseTimer());
    this.el?.addEventListener('pointerleave', () => this.resumeTimer());
    this.el?.addEventListener('focusout', () => this.resumeTimer());
  }

  show(message, variant = 'info', duration = 3200) {
    if (!this.el || !this.msgEl) return;

    this.clearTimer();
    this.el.classList.remove('toast-info', 'toast-hit', 'toast-fault', 'toast-error');
    this.el.classList.add(`toast-${variant}`);
    this.msgEl.textContent = message;

    try {
      if (typeof this.el.showPopover === 'function' && !this.el.matches(':popover-open')) {
        this.el.showPopover();
      } else {
        this.el.hidden = false;
      }
    } catch (_) {
      this.el.hidden = false;
    }

    this.remainingMs = duration;
    this.isPaused = false;
    this.startTimer();
  }

  startTimer() {
    if (this.remainingMs <= 0) return;
    this.startedAt = performance.now();
    this.timerId = setTimeout(() => this.hide(), this.remainingMs);
  }

  pauseTimer() {
    if (this.timerId === null || this.isPaused) return;
    clearTimeout(this.timerId);
    this.timerId = null;
    this.remainingMs = Math.max(0, this.remainingMs - (performance.now() - this.startedAt));
    this.isPaused = true;
  }

  resumeTimer() {
    if (!this.isPaused) return;
    this.isPaused = false;
    this.startTimer();
  }

  clearTimer() {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  hide() {
    this.clearTimer();
    this.isPaused = false;
    if (!this.el) return;
    try {
      if (typeof this.el.hidePopover === 'function' && this.el.matches(':popover-open')) {
        this.el.hidePopover();
      } else {
        this.el.hidden = true;
      }
    } catch (_) {
      this.el.hidden = true;
    }
  }
}

const dom = {
  navTabs: document.querySelectorAll('.nav-tab'),
  views: {
    sim: document.getElementById('section-sim'),
    cmp: document.getElementById('section-cmp'),
    learn: document.getElementById('section-learn')
  },
  viewTitles: {
    sim: document.getElementById('sim-heading'),
    cmp: document.getElementById('cmp-heading'),
    learn: document.getElementById('learn-heading')
  },
  headerStatusReadout: document.getElementById('header-status-readout'),

  // Config & 3-Way Algorithm Switcher
  configForm: document.getElementById('sim-config-form'),
  algoBtns: document.querySelectorAll('.algo-btn'),
  presetSelect: document.getElementById('preset-select'),
  inputRef: document.getElementById('input-ref'),
  refCountPill: document.getElementById('ref-count-pill'),
  inputFrames: document.getElementById('input-frames'),
  btnFramesDec: document.getElementById('btn-frames-dec'),
  btnFramesInc: document.getElementById('btn-frames-inc'),
  btnRun: document.getElementById('btn-run'),
  inputError: document.getElementById('input-error'),

  // Sequence Tape & Telemetry (Keyboard / Remote Driven Playback)
  currentStreamPill: document.getElementById('current-stream-pill'),
  sequenceTape: document.getElementById('sequence-tape'),
  streamPlayPill: document.getElementById('stream-play-pill'),
  stepCounter: document.getElementById('step-counter'),
  simProgress: document.getElementById('sim-progress'),

  intakeStepLabel: document.getElementById('intake-step-label'),
  intakeNextPreview: document.getElementById('intake-next-preview'),
  currentPageBox: document.getElementById('current-page-box'),
  currentPageVal: document.getElementById('current-page-val'),
  currentDecisionBadge: document.getElementById('current-decision-badge'),
  busWiringSvg: document.getElementById('bus-wiring-svg'),
  framesSectionTitle: document.getElementById('frames-section-title'),
  framesContainer: document.getElementById('frames-container'),
  diskPoolList: document.getElementById('disk-pool-list'),

  traceMatrixTable: document.getElementById('trace-matrix-table'),
  explanationBox: document.getElementById('explanation-box'),
  explanationStepTag: document.getElementById('explanation-step-tag'),
  explanationText: document.getElementById('explanation-text'),

  statFaults: document.getElementById('stat-faults'),
  statHits: document.getElementById('stat-hits'),
  statReplacements: document.getElementById('stat-replacements'),
  statFaultRate: document.getElementById('stat-fault-rate'),
  statHitRate: document.getElementById('stat-hit-rate'),
  deltaFaults: document.getElementById('delta-faults'),
  deltaHits: document.getElementById('delta-hits'),
  deltaReplacements: document.getElementById('delta-replacements'),

  // Compare View
  cmpNote: document.getElementById('cmp-note'),
  cmpWorkloadBadge: document.getElementById('cmp-workload-badge'),
  cmpTable: document.getElementById('cmp-table'),
  cmpBars: document.getElementById('cmp-bars'),
  cmpChartReadout: document.getElementById('cmp-chart-readout'),
  cmpTrajectorySvg: document.getElementById('cmp-trajectory-svg'),

  // Learn View
  btnTestBelady: document.getElementById('btn-test-belady'),
  btnLoadBelady: document.getElementById('btn-load-belady'),
  beladyResultBox: document.getElementById('belady-result-box')
};

const toast = new ToastManager();

let currentView = 'sim';
let currentAlgoKey = 'FIFO';
let activeViewTransition = null;
let remoteHost = null;
let lastValidState = {
  sequence: [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2],
  frameCount: 3,
  algoKey: 'FIFO'
};

function buildFullRemoteSnapshot() {
  const simSnap = simulator.getSnapshot();
  const sel = dom.presetSelect?.value || '';
  const activePreset = PRESET_DEFS[sel] ? sel : '';
  return {
    ...simSnap,
    view: currentView,
    classView: document.body.classList.contains('is-classroom-scale'),
    activePreset
  };
}

const simulator = new SimulatorController(dom, {
  onNotify: (msg, variant) => toast.show(msg, variant),
  onStatusChange: ({ algoKey, frameCount, intervalMs }) => {
    if (dom.headerStatusReadout) {
      dom.headerStatusReadout.textContent = `${algoKey} · ${frameCount} Frames · ${intervalMs} ms`;
    }
  },
  onStateUpdate: () => {
    remoteHost?.publishState(buildFullRemoteSnapshot());
  }
});

const comparison = new ComparisonController(dom);

const learning = new LearningController(dom, {
  onNotify: (msg, variant) => toast.show(msg, variant),
  onLoadBeladyPreset: (sequence, frameCount, algoKey) => {
    if (dom.inputRef) dom.inputRef.value = sequence.join(', ');
    if (dom.inputFrames) dom.inputFrames.value = String(frameCount);
    setActiveAlgoButton(algoKey);
    updateRefCountPreview();
    syncStepperBounds();
    markMatchingPreset();

    runSimulationFromInputs({ notify: true, customToast: `Loaded Belady sequence (${frameCount} frames, FIFO)` });
    switchView('sim', true, true);
  }
});

function setActiveAlgoButton(algoKey) {
  currentAlgoKey = algoKey;
  dom.algoBtns.forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.algo === algoKey));
  });
}

function switchView(targetView, updateHash = true, moveFocus = false) {
  if (!dom.views[targetView] || targetView === currentView) return;

  const prevIdx = VIEW_ORDER[currentView] ?? 0;
  const nextIdx = VIEW_ORDER[targetView] ?? 0;
  const direction = nextIdx >= prevIdx ? 'forward' : 'backward';

  if (currentView === 'sim' && simulator.isPlaying) {
    simulator.pause();
  }

  const applyViewSwap = () => {
    Object.entries(dom.views).forEach(([key, sectionEl]) => {
      if (!sectionEl) return;
      const isActive = key === targetView;
      sectionEl.hidden = !isActive;
      sectionEl.classList.remove('section-enter');
      if (isActive && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        void sectionEl.offsetWidth;
        sectionEl.classList.add('section-enter');
      }
    });

    dom.navTabs.forEach((tab) => {
      const isCurrent = tab.dataset.target === targetView;
      if (isCurrent) tab.setAttribute('aria-current', 'page');
      else tab.removeAttribute('aria-current');
    });

    currentView = targetView;

    if (targetView === 'cmp') {
      comparison.render(lastValidState.sequence, lastValidState.frameCount);
    }
    if (targetView === 'sim') {
      requestAnimationFrame(() => simulator.renderBusWiring(simulator.steps[simulator.currentIndex], 'settled'));
    }

    if (updateHash) {
      window.history.replaceState(null, '', `#${targetView}`);
    }

    if (moveFocus) {
      dom.viewTitles[targetView]?.focus({ preventScroll: true });
    }

    remoteHost?.publishState(buildFullRemoteSnapshot());
  };

  if (typeof document.startViewTransition === 'function') {
    if (activeViewTransition) {
      try { activeViewTransition.skipTransition(); } catch (_) { /* noop */ }
    }
    try {
      activeViewTransition = document.startViewTransition({
        update: applyViewSwap,
        types: [direction]
      });
      activeViewTransition.finished.finally(() => {
        activeViewTransition = null;
      });
    } catch (_) {
      activeViewTransition = document.startViewTransition(applyViewSwap);
      activeViewTransition.finished.finally(() => {
        activeViewTransition = null;
      });
    }
  } else {
    applyViewSwap();
  }
}

function updateRefCountPreview() {
  if (!dom.inputRef || !dom.refCountPill) return;
  const tokens = dom.inputRef.value.trim().split(/[\s,]+/).filter(Boolean);
  dom.refCountPill.textContent = `${tokens.length} refs`;
}

function syncStepperBounds() {
  if (!dom.inputFrames) return;
  const val = Number(dom.inputFrames.value);
  if (dom.btnFramesDec) dom.btnFramesDec.disabled = !Number.isFinite(val) || val <= 1;
  if (dom.btnFramesInc) dom.btnFramesInc.disabled = !Number.isFinite(val) || val >= 10;
}

function markMatchingPreset() {
  if (!dom.inputRef || !dom.inputFrames || !dom.presetSelect) return;
  const normalizedInput = dom.inputRef.value.trim().replace(/[\s,]+/g, ',');
  const frameVal = dom.inputFrames.value.trim();

  let matchedKey = 'custom';
  for (const [label, def] of Object.entries(PRESET_DEFS)) {
    const normDef = def.seq.trim().replace(/[\s,]+/g, ',');
    if (normDef === normalizedInput && String(def.frames) === frameVal) {
      matchedKey = label;
      break;
    }
  }
  dom.presetSelect.value = matchedKey;
}

function loadPresetByLabel(label, notify = true) {
  const preset = PRESET_DEFS[label];
  if (!preset) return false;
  if (dom.inputRef) dom.inputRef.value = preset.seq;
  if (dom.inputFrames) dom.inputFrames.value = String(preset.frames);
  updateRefCountPreview();
  syncStepperBounds();
  return runSimulationFromInputs({
    notify,
    customToast: `Preset loaded: ${label}`
  });
}

function toggleClassView() {
  const enabled = document.body.classList.toggle('is-classroom-scale');
  requestAnimationFrame(() => simulator.renderBusWiring(simulator.steps[simulator.currentIndex], 'settled'));
  remoteHost?.publishState(buildFullRemoteSnapshot());
  toast.show(enabled ? 'Class View enabled: enlarged projector typography' : 'Standard scale restored', 'info');
}

function clearValidationError() {
  dom.inputRef?.removeAttribute('aria-invalid');
  dom.inputFrames?.removeAttribute('aria-invalid');
  if (dom.inputError) {
    dom.inputError.hidden = true;
    dom.inputError.textContent = '';
  }
}

function showValidationError(message, fieldEl) {
  if (dom.inputError) {
    dom.inputError.textContent = message;
    dom.inputError.hidden = false;
  }

  if (fieldEl) {
    fieldEl.setAttribute('aria-invalid', 'true');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fieldEl.classList.remove('is-shaking');
      void fieldEl.offsetWidth;
      fieldEl.classList.add('is-shaking');
      fieldEl.addEventListener('animationend', () => fieldEl.classList.remove('is-shaking'), { once: true });
    }
    fieldEl.focus();
  }

  toast.show(message, 'error', 3800);
}

function runSimulationFromInputs(options = {}) {
  clearValidationError();

  const refValidation = validateReferenceString(dom.inputRef?.value ?? '');
  if (!refValidation.isValid) {
    showValidationError(refValidation.error || 'Please enter valid non-negative integers.', dom.inputRef);
    return false;
  }

  const frameValidation = validateFrameCount(dom.inputFrames?.value ?? '', 1, 10);
  if (!frameValidation.isValid) {
    showValidationError(frameValidation.error || 'Frames must be an integer between 1 and 10.', dom.inputFrames);
    return false;
  }

  const algoKey = currentAlgoKey || 'FIFO';
  const result = simulate(algoKey, refValidation.pages, frameValidation.frameCount);

  lastValidState = {
    sequence: [...refValidation.pages],
    frameCount: frameValidation.frameCount,
    algoKey
  };

  simulator.load(result, lastValidState);
  markMatchingPreset();

  if (currentView === 'cmp') {
    comparison.render(lastValidState.sequence, lastValidState.frameCount);
  }

  if (options.notify) {
    const msg = options.customToast || `${algoKey}: ${refValidation.pages.length} requests in ${frameValidation.frameCount} frames`;
    toast.show(msg, 'info');
  }

  return true;
}

function bindEvents() {
  dom.navTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      switchView(tab.dataset.target, true, true);
    });
  });

  window.addEventListener('hashchange', () => {
    const hashTarget = window.location.hash.replace('#', '');
    if (VIEW_ORDER[hashTarget] !== undefined) {
      switchView(hashTarget, false, false);
    }
  });

  dom.algoBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const chosen = btn.dataset.algo || 'FIFO';
      setActiveAlgoButton(chosen);
      runSimulationFromInputs({ notify: true });
    });
  });

  dom.configForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    runSimulationFromInputs({ notify: true });
  });

  dom.inputRef?.addEventListener('input', () => {
    clearValidationError();
    updateRefCountPreview();
    markMatchingPreset();
  });

  dom.inputFrames?.addEventListener('input', () => {
    clearValidationError();
    syncStepperBounds();
    markMatchingPreset();
  });

  dom.btnFramesDec?.addEventListener('click', () => {
    const curr = Number(dom.inputFrames?.value) || 3;
    if (curr > 1 && dom.inputFrames) {
      dom.inputFrames.value = String(curr - 1);
      syncStepperBounds();
      runSimulationFromInputs({ notify: true });
    }
  });

  dom.btnFramesInc?.addEventListener('click', () => {
    const curr = Number(dom.inputFrames?.value) || 3;
    if (curr < 10 && dom.inputFrames) {
      dom.inputFrames.value = String(curr + 1);
      syncStepperBounds();
      runSimulationFromInputs({ notify: true });
    }
  });

  dom.presetSelect?.addEventListener('change', () => {
    const chosen = dom.presetSelect.value;
    if (PRESET_DEFS[chosen]) {
      loadPresetByLabel(chosen, true);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (e.key === 'c' || e.key === 'C') {
      e.preventDefault();
      toggleClassView();
      return;
    }

    if (currentView !== 'sim') return;

    if (e.key === ' ') {
      if (tag === 'BUTTON' || e.target?.getAttribute?.('role') === 'button') return;
      e.preventDefault();
      simulator.togglePlay();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      simulator.next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      simulator.prev();
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault();
      simulator.reset(true);
    } else if (e.key === '[' || e.key === '-') {
      e.preventDefault();
      const nextMs = Math.min(2800, simulator.intervalMs + 200);
      simulator.setSpeedMs(nextMs);
      toast.show(`Speed slowed: ${nextMs} ms / step`, 'info');
    } else if (e.key === ']' || e.key === '=' || e.key === '+') {
      e.preventDefault();
      const nextMs = Math.max(300, simulator.intervalMs - 200);
      simulator.setSpeedMs(nextMs);
      toast.show(`Speed increased: ${nextMs} ms / step`, 'info');
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      e.preventDefault();
      const map = { 1: 'FIFO', 2: 'LRU', 3: 'OPTIMAL' };
      setActiveAlgoButton(map[e.key]);
      runSimulationFromInputs({ notify: true });
    }
  });
}

function handleRemoteCommand(cmd) {
  const { type, payload = {} } = cmd || {};

  const ensureSimTab = () => {
    if (currentView !== 'sim') switchView('sim', true, false);
  };

  switch (type) {
    case 'NEXT':
      ensureSimTab();
      simulator.next();
      break;
    case 'PREV':
      ensureSimTab();
      simulator.prev();
      break;
    case 'PLAY':
      ensureSimTab();
      simulator.play();
      break;
    case 'PAUSE':
      simulator.pause();
      break;
    case 'TOGGLE_PLAY':
      ensureSimTab();
      simulator.togglePlay();
      break;
    case 'RESET':
      ensureSimTab();
      simulator.reset(false);
      break;
    case 'GOTO_STEP':
      ensureSimTab();
      simulator.goToStep(Number(payload.index), false);
      break;
    case 'SET_SPEED':
      if (Number.isFinite(Number(payload.ms))) {
        simulator.setSpeedMs(Number(payload.ms));
      }
      break;
    case 'SET_ALGO': {
      try {
        const algo = normalizeAlgorithmKey(payload.algoKey);
        setActiveAlgoButton(algo);
        runSimulationFromInputs({ notify: true });
      } catch (_) {
        /* ignore invalid algo */
      }
      break;
    }
    case 'SET_FRAMES': {
      const n = Number(payload.frameCount);
      if (Number.isInteger(n) && n >= 1 && n <= 10 && dom.inputFrames) {
        dom.inputFrames.value = String(n);
        syncStepperBounds();
        runSimulationFromInputs({ notify: true });
      }
      break;
    }
    case 'LOAD_PRESET': {
      const targetLabel = String(payload.label || '').trim();
      if (PRESET_DEFS[targetLabel]) {
        ensureSimTab();
        loadPresetByLabel(targetLabel, true);
      }
      break;
    }
    case 'SWITCH_VIEW':
      if (VIEW_ORDER[payload.view] !== undefined) {
        switchView(payload.view, true, false);
      }
      break;
    case 'TOGGLE_CLASS_VIEW':
      toggleClassView();
      break;
    case 'RUN_BELADY_PROOF':
      if (currentView !== 'learn') switchView('learn', true, false);
      learning.runBeladyProof(true);
      break;
    default:
      break;
  }
}

function init() {
  const remoteLaunch = detectRemoteLaunchParam();
  if (remoteLaunch.isRemote) {
    new RemoteControllerUI(remoteLaunch.code);
    return;
  }

  bindEvents();
  updateRefCountPreview();
  syncStepperBounds();
  setActiveAlgoButton('FIFO');
  runSimulationFromInputs({ notify: false });
  learning.runBeladyProof(false);

  const initialHash = window.location.hash.replace('#', '');
  if (VIEW_ORDER[initialHash] !== undefined && initialHash !== 'sim') {
    switchView(initialHash, false, false);
  }

  remoteHost = new RemoteHostBridge({
    onCommand: handleRemoteCommand,
    onNotify: (msg, variant) => toast.show(msg, variant),
    getStateSnapshot: buildFullRemoteSnapshot
  });
}

init();
