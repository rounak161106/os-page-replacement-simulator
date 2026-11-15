/**
 * FrameLab - Simulator Controller Module
 * Manages simulation playback, step navigation, memory frame rendering,
 * timeline synchronization, and educational narratives.
 */

import { simulate, DECISIONS } from './algorithms.js';

// Playback speeds in milliseconds (speed levels 1 through 6)
const SPEED_DELAYS = [1800, 1300, 850, 500, 300, 150];

export class SimulatorController {
  /**
   * @param {object} elements - Dictionary of DOM elements required by the simulator
   */
  constructor(elements) {
    this.el = elements;
    this.sequence = [];
    this.frameCount = 3;
    this.algorithm = 'FIFO';
    this.result = null;
    this.currentStepIndex = -1;
    this.timer = null;
    this.speedLevel = 3;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Listen for reduced motion preference changes
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
      this.reducedMotion = e.matches;
    });

    this.bindEvents();
  }

  /**
   * Attach event listeners to simulator controls.
   */
  bindEvents() {
    if (this.el.btnPlay) {
      this.el.btnPlay.addEventListener('click', () => this.togglePlay());
    }
    if (this.el.btnNext) {
      this.el.btnNext.addEventListener('click', () => {
        this.pause();
        this.next();
      });
    }
    if (this.el.btnPrev) {
      this.el.btnPrev.addEventListener('click', () => {
        this.pause();
        this.prev();
      });
    }
    if (this.el.btnReset) {
      this.el.btnReset.addEventListener('click', () => {
        this.pause();
        this.goToStep(-1, false);
      });
    }
    if (this.el.speedSlider) {
      this.el.speedSlider.addEventListener('input', e => {
        this.speedLevel = Number(e.target.value);
        if (this.isPlaying()) {
          this.pause();
          this.play();
        }
      });
    }
  }

  /**
   * Initializes or updates the simulator with a new simulation dataset.
   *
   * @param {number[]} sequence
   * @param {number} frameCount
   * @param {'FIFO'|'LRU'|'OPTIMAL'} algorithm
   */
  load(sequence, frameCount, algorithm) {
    this.pause();
    this.sequence = [...sequence];
    this.frameCount = frameCount;
    this.algorithm = algorithm;
    this.result = simulate(algorithm, this.sequence, this.frameCount);
    this.currentStepIndex = -1;

    this.renderInitialStage();
    this.renderTimeline();
    this.updateView(false);
  }

  /**
   * Checks if playback is actively running.
   * @returns {boolean}
   */
  isPlaying() {
    return this.timer !== null;
  }

  /**
   * Starts automatic step playback.
   */
  play() {
    if (this.isPlaying()) return;
    if (!this.result || this.sequence.length === 0) return;

    // If at the end, restart from beginning
    if (this.currentStepIndex >= this.sequence.length - 1) {
      this.goToStep(-1, false);
    }

    this.updatePlayButtonState(true);

    const delay = SPEED_DELAYS[this.speedLevel - 1] || 850;
    this.timer = setInterval(() => {
      if (this.currentStepIndex >= this.sequence.length - 1) {
        this.pause();
        return;
      }
      this.next();
    }, delay);
  }

  /**
   * Pauses automatic playback.
   */
  pause() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.updatePlayButtonState(false);
  }

  /**
   * Toggles playback between play and pause.
   */
  togglePlay() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Advances to the next step.
   */
  next() {
    if (!this.result) return;
    if (this.currentStepIndex < this.sequence.length - 1) {
      this.goToStep(this.currentStepIndex + 1, true);
    } else {
      this.pause();
    }
  }

  /**
   * Steps back to the previous step.
   */
  prev() {
    if (!this.result) return;
    if (this.currentStepIndex > -1) {
      this.goToStep(this.currentStepIndex - 1, false);
    }
  }

  /**
   * Jumps to a specific step index (-1 to sequence.length - 1).
   *
   * @param {number} stepIdx
   * @param {boolean} animate
   */
  goToStep(stepIdx, animate = true) {
    if (!this.result) return;
    const clamped = Math.max(-1, Math.min(this.sequence.length - 1, stepIdx));
    this.currentStepIndex = clamped;
    this.updateView(animate);
  }

  /**
   * Pre-renders the memory frame slots container.
   */
  renderInitialStage() {
    if (!this.el.framesContainer) return;
    this.el.framesContainer.innerHTML = '';

    for (let k = 0; k < this.frameCount; k++) {
      const slot = document.createElement('div');
      slot.className = 'frame-slot empty';
      slot.setAttribute('role', 'listitem');
      slot.dataset.frame = String(k);

      const label = document.createElement('span');
      label.className = 'slot-label';
      label.textContent = `Frame ${k + 1}`;

      const value = document.createElement('span');
      value.className = 'slot-value';
      value.textContent = '–';

      const evictedTag = document.createElement('span');
      evictedTag.className = 'slot-evicted';
      evictedTag.textContent = '';

      slot.appendChild(label);
      slot.appendChild(value);
      slot.appendChild(evictedTag);
      this.el.framesContainer.appendChild(slot);
    }
  }

  /**
   * Renders the interactive timeline pills.
   */
  renderTimeline() {
    if (!this.el.timelineContainer) return;
    this.el.timelineContainer.innerHTML = '';

    const steps = this.result ? this.result.steps : [];

    steps.forEach((step, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'timeline-pill future';
      btn.dataset.index = String(idx);
      btn.setAttribute('aria-label', `Step ${step.stepNumber}, Page ${step.requestedPage}`);

      const num = document.createElement('span');
      num.className = 'pill-num';
      num.textContent = String(step.requestedPage);

      const status = document.createElement('span');
      status.className = 'pill-status';
      status.textContent = step.isHit ? 'H' : 'F';

      btn.appendChild(num);
      btn.appendChild(status);

      btn.addEventListener('click', () => {
        this.pause();
        this.goToStep(idx, true);
      });

      this.el.timelineContainer.appendChild(btn);
    });
  }

  /**
   * Synchronizes all simulator views (frames, timeline, progress, stats, disk, SVG).
   *
   * @param {boolean} animate
   */
  updateView(animate) {
    if (!this.result) return;

    const step = this.currentStepIndex >= 0 ? this.result.steps[this.currentStepIndex] : null;
    const slots = this.el.framesContainer ? Array.from(this.el.framesContainer.children) : [];

    // 1. Update memory slots
    for (let k = 0; k < this.frameCount; k++) {
      const slotEl = slots[k];
      if (!slotEl) continue;

      const pageVal = step ? step.framesAfter[k] : null;
      const slotValEl = slotEl.querySelector('.slot-value');
      const slotEvictedEl = slotEl.querySelector('.slot-evicted');

      slotEl.className = 'frame-slot' + (pageVal === null ? ' empty' : ' occupied');
      if (slotValEl) slotValEl.textContent = pageVal === null ? '–' : String(pageVal);

      // Check if this frame is affected in the current step
      if (step && step.affectedFrameIndex === k) {
        if (step.isHit) {
          slotEl.classList.add('hit-active');
          if (slotEvictedEl) slotEvictedEl.textContent = 'Hit';
          if (animate && !this.reducedMotion) {
            this.triggerPulseAnimation(slotEl);
          }
        } else {
          slotEl.classList.add('fault-active');
          if (step.isReplacement && step.evictedPage !== null) {
            slotEl.classList.add('replacement-target');
            if (slotEvictedEl) slotEvictedEl.textContent = `Evicted ${step.evictedPage}`;
          } else {
            if (slotEvictedEl) slotEvictedEl.textContent = 'Loaded';
          }
          if (animate && !this.reducedMotion) {
            this.triggerDropAnimation(slotEl);
          }
        }
      } else {
        if (slotEvictedEl) slotEvictedEl.textContent = '';
      }
    }

    // 2. Update current page indicator
    if (this.el.currentPageVal) {
      this.el.currentPageVal.textContent = step ? String(step.requestedPage) : '–';
    }
    if (this.el.currentPageBox) {
      this.el.currentPageBox.className = 'current-page-box';
      if (step) {
        this.el.currentPageBox.classList.add(step.isHit ? 'state-hit' : 'state-fault');
      }
    }

    // 3. Update narrative / educational explanation
    if (this.el.explanationText) {
      if (step) {
        this.el.explanationText.textContent = step.explanation;
        if (this.el.explanationBox) {
          this.el.explanationBox.className = 'explanation-box ' + (step.isHit ? 'hit' : 'fault');
        }
      } else {
        this.el.explanationText.textContent = 'Press Next or Play to step through memory decisions.';
        if (this.el.explanationBox) {
          this.el.explanationBox.className = 'explanation-box neutral';
        }
      }
    }

    // 4. Update timeline pills
    if (this.el.timelineContainer) {
      const pills = Array.from(this.el.timelineContainer.children);
      pills.forEach((pill, idx) => {
        const stepData = this.result.steps[idx];
        pill.className = 'timeline-pill';

        if (idx > this.currentStepIndex) {
          pill.classList.add('future');
        } else {
          pill.classList.add(stepData.isHit ? 'hit' : 'fault');
        }

        if (idx === this.currentStepIndex) {
          pill.classList.add('active');
          pill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
    }

    // 5. Update progress bar and counter
    const currentStepNum = this.currentStepIndex + 1;
    const totalSteps = this.sequence.length;

    if (this.el.progressBar) {
      this.el.progressBar.max = totalSteps;
      this.el.progressBar.value = currentStepNum;
    }
    if (this.el.stepCounter) {
      this.el.stepCounter.textContent = `Step ${currentStepNum} of ${totalSteps}`;
    }

    // 6. Update stats badges
    const currentFaults = step ? step.cumulativeFaults : 0;
    const currentHits = step ? step.cumulativeHits : 0;
    const currentReplacements = step ? step.cumulativeReplacements : 0;
    const currentHitRatio = currentStepNum > 0 ? (currentHits / currentStepNum) * 100 : 0;
    const currentFaultRatio = currentStepNum > 0 ? (currentFaults / currentStepNum) * 100 : 0;

    if (this.el.statFaults) this.el.statFaults.textContent = String(currentFaults);
    if (this.el.statHits) this.el.statHits.textContent = String(currentHits);
    if (this.el.statReplacements) this.el.statReplacements.textContent = String(currentReplacements);
    if (this.el.statHitRate) this.el.statHitRate.textContent = `${currentHitRatio.toFixed(1)}%`;
    if (this.el.statFaultRate) this.el.statFaultRate.textContent = `${currentFaultRatio.toFixed(1)}%`;

    // 7. Update disk / evicted pages pool
    if (this.el.diskContainer) {
      this.updateDiskPool();
    }

    // 8. Update cumulative fault sparkline SVG
    if (this.el.faultCurveSvg) {
      this.renderFaultProgressionSvg();
    }

    // 9. Update navigation button disabled states
    if (this.el.btnPrev) this.el.btnPrev.disabled = this.currentStepIndex <= -1;
    if (this.el.btnNext) this.el.btnNext.disabled = this.currentStepIndex >= totalSteps - 1;
  }

  /**
   * Updates the evicted pages list displayed in the disk panel.
   */
  updateDiskPool() {
    this.el.diskContainer.innerHTML = '';

    if (this.currentStepIndex < 0) {
      const emptyNote = document.createElement('span');
      emptyNote.className = 'disk-empty-note';
      emptyNote.textContent = 'Frames still have free room. No evictions yet.';
      this.el.diskContainer.appendChild(emptyNote);
      return;
    }

    const pastSteps = this.result.steps.slice(0, this.currentStepIndex + 1);
    const evictedSteps = pastSteps.filter(s => s.evictedPage !== null);

    if (evictedSteps.length === 0) {
      const emptyNote = document.createElement('span');
      emptyNote.className = 'disk-empty-note';
      emptyNote.textContent = 'No pages evicted yet.';
      this.el.diskContainer.appendChild(emptyNote);
      return;
    }

    // Show most recently evicted first
    evictedSteps.slice().reverse().forEach((s, idx) => {
      const chip = document.createElement('div');
      chip.className = 'disk-chip' + (idx === 0 ? ' latest' : '');

      const pageNum = document.createElement('span');
      pageNum.className = 'chip-page';
      pageNum.textContent = `P${s.evictedPage}`;

      const stepNum = document.createElement('span');
      stepNum.className = 'chip-step';
      stepNum.textContent = `from F${s.affectedFrameIndex + 1} (step ${s.stepNumber})`;

      chip.appendChild(pageNum);
      chip.appendChild(stepNum);
      this.el.diskContainer.appendChild(chip);
    });
  }

  /**
   * Renders the cumulative fault curve in the SVG container.
   */
  renderFaultProgressionSvg() {
    const svg = this.el.faultCurveSvg;
    if (!svg || !this.result) return;

    const width = 600;
    const height = 120;
    const padding = { top: 16, right: 20, bottom: 20, left: 30 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const totalSteps = this.sequence.length;
    const maxFaults = Math.max(1, this.result.totalFaults);

    const getX = stepIdx => padding.left + ((stepIdx + 1) / totalSteps) * chartW;
    const getY = faultCount => padding.top + chartH - (faultCount / maxFaults) * chartH;

    // Build points for total reference curve
    const allSteps = this.result.steps;
    const totalPoints = [`${padding.left},${getY(0)}`];
    allSteps.forEach((s, idx) => {
      totalPoints.push(`${getX(idx).toFixed(1)},${getY(s.cumulativeFaults).toFixed(1)}`);
    });

    // Build points for progress curve up to current step
    const currentPoints = [`${padding.left},${getY(0)}`];
    if (this.currentStepIndex >= 0) {
      for (let i = 0; i <= this.currentStepIndex; i++) {
        const s = allSteps[i];
        currentPoints.push(`${getX(i).toFixed(1)},${getY(s.cumulativeFaults).toFixed(1)}`);
      }
    }

    const currentX = this.currentStepIndex >= 0 ? getX(this.currentStepIndex) : padding.left;
    const currentY = this.currentStepIndex >= 0 ? getY(allSteps[this.currentStepIndex].cumulativeFaults) : getY(0);

    svg.innerHTML = `
      <defs>
        <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.25"/>
          <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      <!-- Base baseline -->
      <line x1="${padding.left}" y1="${getY(0)}" x2="${width - padding.right}" y2="${getY(0)}" stroke="var(--color-border)" stroke-width="1" />
      <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6" />
      
      <!-- Ghost curve showing full trajectory -->
      <polyline points="${totalPoints.join(' ')}" fill="none" stroke="var(--color-muted-foreground)" stroke-width="1.5" stroke-dasharray="4,4" opacity="0.4" />
      
      <!-- Active progress curve -->
      <polyline points="${currentPoints.join(' ')}" fill="none" stroke="var(--color-fault)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      
      <!-- Tracking indicator dot -->
      <circle cx="${currentX.toFixed(1)}" cy="${currentY.toFixed(1)}" r="5" fill="var(--color-fault)" stroke="var(--color-card)" stroke-width="2" />
      
      <!-- Axis Labels -->
      <text x="${padding.left - 6}" y="${getY(0) + 4}" text-anchor="end" fill="var(--color-muted-foreground)" font-size="10" font-family="var(--font-mono)">0</text>
      <text x="${padding.left - 6}" y="${padding.top + 4}" text-anchor="end" fill="var(--color-muted-foreground)" font-size="10" font-family="var(--font-mono)">${maxFaults}</text>
      <text x="${width - padding.right}" y="${height - 4}" text-anchor="end" fill="var(--color-muted-foreground)" font-size="10" font-family="var(--font-mono)">Faults over references</text>
    `;
  }

  /**
   * Triggers micro-animation for a page hit.
   * @param {HTMLElement} element
   */
  triggerPulseAnimation(element) {
    element.classList.remove('anim-pulse-hit');
    void element.offsetWidth; // Force reflow
    element.classList.add('anim-pulse-hit');
  }

  /**
   * Triggers micro-animation for a page load or replacement.
   * @param {HTMLElement} element
   */
  triggerDropAnimation(element) {
    element.classList.remove('anim-drop-in');
    void element.offsetWidth; // Force reflow
    element.classList.add('anim-drop-in');
  }

  /**
   * Updates play button text and icon.
   * @param {boolean} playing
   */
  updatePlayButtonState(playing) {
    if (!this.el.btnPlay) return;
    if (playing) {
      this.el.btnPlay.innerHTML = `
        <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <rect x="6" y="4" width="4" height="16" rx="1"/>
          <rect x="14" y="4" width="4" height="16" rx="1"/>
        </svg>
        <span>Pause</span>
      `;
      this.el.btnPlay.setAttribute('aria-label', 'Pause simulation');
    } else {
      this.el.btnPlay.innerHTML = `
        <svg class="btn-icon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <polygon points="5 3 19 12 5 21 5 3"/>
        </svg>
        <span>Play</span>
      `;
      this.el.btnPlay.setAttribute('aria-label', 'Play simulation');
    }
  }

  /**
   * Teardown timer on unload.
   */
  destroy() {
    this.pause();
  }
}
