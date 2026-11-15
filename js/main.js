/**
 * FrameLab - Main Application Entrypoint
 * Orchestrates navigation routing, input validation,
 * preset loading, and sub-controllers initialization.
 */

import { validateReferenceString, validateFrameCount } from './validation.js';
import { SimulatorController } from './simulator.js';
import { ComparisonController } from './comparison.js';
import { LearningController } from './learning.js';

// Application State
let simulatorInstance = null;
let comparisonInstance = null;
let learningInstance = null;

let currentValidatedSequence = [];
let currentValidatedFrameCount = 3;
let currentAlgorithm = 'FIFO';

// DOM Element References
const dom = {
  // Navigation
  navTabs: document.querySelectorAll('.nav-tab'),
  sections: {
    sim: document.getElementById('section-sim'),
    cmp: document.getElementById('section-cmp'),
    learn: document.getElementById('section-learn')
  },

  // Simulator Inputs
  inputRef: document.getElementById('input-ref'),
  inputFrames: document.getElementById('input-frames'),
  selectAlgo: document.getElementById('select-algo'),
  btnRun: document.getElementById('btn-run'),
  inputRefError: document.getElementById('input-ref-error'),
  presetChips: document.querySelectorAll('.preset-chip'),

  // Simulator Stage
  stageBox: document.getElementById('simulator-stage-box'),
  btnPrev: document.getElementById('btn-prev'),
  btnPlay: document.getElementById('btn-play'),
  btnNext: document.getElementById('btn-next'),
  btnReset: document.getElementById('btn-reset'),
  speedSlider: document.getElementById('speed-slider'),
  speedTimingBadge: document.getElementById('speed-timing-badge'),
  speedPresetBtns: document.querySelectorAll('.speed-preset-btn'),
  stepCounter: document.getElementById('step-counter'),
  progressBar: document.getElementById('sim-progress'),
  currentPageBox: document.getElementById('current-page-box'),
  currentPageVal: document.getElementById('current-page-val'),
  framesContainer: document.getElementById('frames-container'),
  diskContainer: document.getElementById('disk-pool-list'),
  explanationBox: document.getElementById('explanation-box'),
  explanationText: document.getElementById('explanation-text'),
  timelineContainer: document.getElementById('timeline-container'),
  faultCurveSvg: document.getElementById('fault-curve-svg'),

  // Stats
  statFaults: document.getElementById('stat-faults'),
  statHits: document.getElementById('stat-hits'),
  statReplacements: document.getElementById('stat-replacements'),
  statFaultRate: document.getElementById('stat-fault-rate'),
  statHitRate: document.getElementById('stat-hit-rate'),

  // Comparison
  cmpNote: document.getElementById('cmp-note'),
  cmpTable: document.getElementById('cmp-table'),
  cmpBars: document.getElementById('cmp-bars'),
  cmpTrajectorySvg: document.getElementById('cmp-trajectory-svg'),

  // Learning
  btnTestBelady: document.getElementById('btn-test-belady'),
  btnLoadBelady: document.getElementById('btn-load-belady'),
  beladyResultBox: document.getElementById('belady-result-box')
};

/**
 * Initializes the FrameLab application.
 */
function init() {
  initControllers();
  initRouting();
  bindInputEvents();

  // Run initial simulation on load
  runSimulationFromInputs();
}

/**
 * Instantiates the simulator, comparison, and learning controllers.
 */
function initControllers() {
  simulatorInstance = new SimulatorController({
    btnPlay: dom.btnPlay,
    btnNext: dom.btnNext,
    btnPrev: dom.btnPrev,
    btnReset: dom.btnReset,
    speedSlider: dom.speedSlider,
    speedTimingBadge: dom.speedTimingBadge,
    speedPresetBtns: dom.speedPresetBtns,
    stepCounter: dom.stepCounter,
    progressBar: dom.progressBar,
    currentPageBox: dom.currentPageBox,
    currentPageVal: dom.currentPageVal,
    framesContainer: dom.framesContainer,
    diskContainer: dom.diskContainer,
    explanationBox: dom.explanationBox,
    explanationText: dom.explanationText,
    timelineContainer: dom.timelineContainer,
    faultCurveSvg: dom.faultCurveSvg,
    statFaults: dom.statFaults,
    statHits: dom.statHits,
    statReplacements: dom.statReplacements,
    statFaultRate: dom.statFaultRate,
    statHitRate: dom.statHitRate
  });

  comparisonInstance = new ComparisonController({
    note: dom.cmpNote,
    table: dom.cmpTable,
    barsContainer: dom.cmpBars,
    curveSvg: dom.cmpTrajectorySvg
  });

  learningInstance = new LearningController(
    {
      btnTestBelady: dom.btnTestBelady,
      btnLoadBelady: dom.btnLoadBelady,
      beladyResultBox: dom.beladyResultBox
    },
    // Callback to load Belady preset into simulator
    (presetSequence, presetFrames) => {
      dom.inputRef.value = presetSequence.join(', ');
      dom.inputFrames.value = String(presetFrames);
      dom.selectAlgo.value = 'FIFO';
      switchView('sim');
      runSimulationFromInputs();
    }
  );
}

/**
 * Handles tab navigation and hash routing.
 */
function initRouting() {
  dom.navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetView = tab.dataset.target;
      switchView(targetView);
    });
  });

  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '');
    if (dom.sections[hash]) {
      switchView(hash, false);
    }
  });

  // Initial route
  const initialHash = location.hash.replace('#', '');
  if (dom.sections[initialHash]) {
    switchView(initialHash, false);
  } else {
    switchView('sim', false);
  }
}

function switchView(targetView, updateHash = true) {
  // Update nav buttons
  dom.navTabs.forEach(btn => {
    const isTarget = btn.dataset.target === targetView;
    btn.setAttribute('aria-current', isTarget ? 'page' : 'false');
  });

  // Toggle sections
  Object.keys(dom.sections).forEach(viewKey => {
    const section = dom.sections[viewKey];
    if (section) {
      if (viewKey === targetView) {
        section.hidden = false;
        section.classList.add('section-fade-in');
      } else {
        section.hidden = true;
        section.classList.remove('section-fade-in');
      }
    }
  });

  if (updateHash) {
    location.hash = targetView;
  }

  // Trigger comparison calculation when switching to compare tab
  if (targetView === 'cmp') {
    if (validateAndExtractInputs()) {
      comparisonInstance.render(currentValidatedSequence, currentValidatedFrameCount);
    } else {
      comparisonInstance.renderEmptyState('Please enter a valid reference sequence on the Simulator tab.');
    }
  }
}

/**
 * Validates inputs from form controls.
 * @returns {boolean}
 */
function validateAndExtractInputs() {
  const refValidation = validateReferenceString(dom.inputRef.value);
  if (!refValidation.isValid) {
    showError(refValidation.error);
    return false;
  }

  const frameValidation = validateFrameCount(dom.inputFrames.value);
  if (!frameValidation.isValid) {
    showError(frameValidation.error);
    return false;
  }

  clearError();
  currentValidatedSequence = refValidation.pages;
  currentValidatedFrameCount = frameValidation.frameCount;
  currentAlgorithm = dom.selectAlgo.value;
  return true;
}

function showError(msg) {
  if (dom.inputRefError) {
    dom.inputRefError.textContent = msg;
  }
}

function clearError() {
  if (dom.inputRefError) {
    dom.inputRefError.textContent = '';
  }
}

/**
 * Executes the simulation using current inputs.
 */
function runSimulationFromInputs() {
  if (!validateAndExtractInputs()) return;

  simulatorInstance.load(
    currentValidatedSequence,
    currentValidatedFrameCount,
    currentAlgorithm
  );
}

/**
 * Binds input field and preset events.
 */
function bindInputEvents() {
  if (dom.btnRun) {
    dom.btnRun.addEventListener('click', () => runSimulationFromInputs());
  }

  if (dom.inputRef) {
    dom.inputRef.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        runSimulationFromInputs();
      }
    });
  }

  if (dom.selectAlgo) {
    dom.selectAlgo.addEventListener('change', () => {
      runSimulationFromInputs();
    });
  }

  if (dom.presetChips) {
    dom.presetChips.forEach(chip => {
      chip.addEventListener('click', () => {
        dom.inputRef.value = chip.dataset.seq;
        dom.inputFrames.value = chip.dataset.frames || '3';
        runSimulationFromInputs();
      });
    });
  }
}

// Start application when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
