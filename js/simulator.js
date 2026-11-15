/**
 * FrameLab — Memory Atlas Simulator Controller
 * Orchestrates memory-cell architecture updates, reference stream tracking,
 * ingestion gateway transitions, and editorial narratives.
 */

import { simulate } from './algorithms.js';

const SPEED_DELAYS = [1600, 1200, 850, 550, 350, 200];

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

    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', e => {
      this.reducedMotion = e.matches;
    });

    this.bindEvents();
  }

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
   * Initializes simulator with a new sequence and frame allotment.
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

  isPlaying() {
    return this.timer !== null;
  }

  play() {
    if (this.isPlaying()) return;
    if (!this.result || this.sequence.length === 0) return;

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

  pause() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.updatePlayButtonState(false);
  }

  togglePlay() {
    if (this.isPlaying()) {
      this.pause();
    } else {
      this.play();
    }
  }

  next() {
    if (!this.result) return;
    if (this.currentStepIndex < this.sequence.length - 1) {
      this.goToStep(this.currentStepIndex + 1, true);
    } else {
      this.pause();
    }
  }

  prev() {
    if (!this.result) return;
    if (this.currentStepIndex > -1) {
      this.goToStep(this.currentStepIndex - 1, false);
    }
  }

  goToStep(stepIdx, animate = true) {
    if (!this.result) return;
    const clamped = Math.max(-1, Math.min(this.sequence.length - 1, stepIdx));
    this.currentStepIndex = clamped;
    this.updateView(animate);
  }

  /**
   * Renders initial architectural memory frame cells.
   */
  renderInitialStage() {
    if (!this.el.framesContainer) return;
    this.el.framesContainer.innerHTML = '';

    for (let k = 0; k < this.frameCount; k++) {
      const cell = document.createElement('div');
      cell.className = 'memory-frame-cell empty-cell';
      cell.setAttribute('role', 'listitem');
      cell.dataset.frame = String(k);

      const header = document.createElement('div');
      header.className = 'cell-header';

      const idTag = document.createElement('span');
      idTag.className = 'frame-id-tag';
      idTag.textContent = `FRAME ${String(k + 1).padStart(2, '0')}`;

      const statusBadge = document.createElement('span');
      statusBadge.className = 'cell-status-badge badge-neutral';
      statusBadge.textContent = 'Empty';

      header.appendChild(idTag);
      header.appendChild(statusBadge);

      const valueContainer = document.createElement('div');
      valueContainer.className = 'cell-value-container';

      const pageVal = document.createElement('span');
      pageVal.className = 'frame-page-val font-mono';
      pageVal.textContent = '–';

      valueContainer.appendChild(pageVal);

      const footer = document.createElement('div');
      footer.className = 'cell-footer';
      footer.textContent = 'Unallocated';

      cell.appendChild(header);
      cell.appendChild(valueContainer);
      cell.appendChild(footer);

      this.el.framesContainer.appendChild(cell);
    }
  }

  /**
   * Renders the reference stream horizontal token timeline.
   */
  renderTimeline() {
    if (!this.el.timelineContainer) return;
    this.el.timelineContainer.innerHTML = '';

    const steps = this.result ? this.result.steps : [];

    steps.forEach((step, idx) => {
      const token = document.createElement('button');
      token.type = 'button';
      token.className = 'stream-token upcoming';
      token.dataset.index = String(idx);
      token.setAttribute('aria-label', `Step ${step.stepNumber}: page ${step.requestedPage}`);

      const pageNum = document.createElement('span');
      pageNum.className = 'token-page-num font-mono';
      pageNum.textContent = String(step.requestedPage);

      const dot = document.createElement('span');
      dot.className = 'token-status-dot';

      token.appendChild(pageNum);
      token.appendChild(dot);

      token.addEventListener('click', () => {
        this.pause();
        this.goToStep(idx, true);
      });

      this.el.timelineContainer.appendChild(token);
    });
  }

  /**
   * Synchronizes all visual components with the active simulation state.
   */
  updateView(animate) {
    if (!this.result) return;

    const step = this.currentStepIndex >= 0 ? this.result.steps[this.currentStepIndex] : null;
    const cells = this.el.framesContainer ? Array.from(this.el.framesContainer.children) : [];

    // 1. Update physical memory cells
    for (let k = 0; k < this.frameCount; k++) {
      const cell = cells[k];
      if (!cell) continue;

      const pageVal = step ? step.framesAfter[k] : null;
      const pageValEl = cell.querySelector('.frame-page-val');
      const badgeEl = cell.querySelector('.cell-status-badge');
      const footerEl = cell.querySelector('.cell-footer');

      cell.className = 'memory-frame-cell' + (pageVal === null ? ' empty-cell' : '');
      if (pageValEl) pageValEl.textContent = pageVal === null ? '–' : String(pageVal);

      if (pageVal === null) {
        if (badgeEl) {
          badgeEl.className = 'cell-status-badge badge-neutral';
          badgeEl.textContent = 'Empty';
        }
        if (footerEl) footerEl.textContent = 'Unallocated';
      } else {
        if (badgeEl) {
          badgeEl.className = 'cell-status-badge badge-neutral';
          badgeEl.textContent = 'Resident';
        }
        if (footerEl) footerEl.textContent = 'In Memory';
      }

      // Check if this frame is active in current step
      if (step && step.affectedFrameIndex === k) {
        if (step.isHit) {
          cell.classList.add('hit-active');
          if (badgeEl) {
            badgeEl.className = 'cell-status-badge badge-hit';
            badgeEl.textContent = 'Hit';
          }
          if (footerEl) footerEl.textContent = 'Page Hit in Frame';
          if (animate && !this.reducedMotion) {
            this.triggerPulseAnimation(cell);
          }
        } else {
          cell.classList.add('fault-active');
          if (step.isReplacement && step.evictedPage !== null) {
            cell.classList.add('victim-cell');
            if (badgeEl) {
              badgeEl.className = 'cell-status-badge badge-replacement';
              badgeEl.textContent = 'Replaced';
            }
            if (footerEl) footerEl.textContent = `Evicted P${step.evictedPage}`;
          } else {
            if (badgeEl) {
              badgeEl.className = 'cell-status-badge badge-fault';
              badgeEl.textContent = 'Loaded';
            }
            if (footerEl) footerEl.textContent = 'Loaded into Empty Frame';
          }
          if (animate && !this.reducedMotion) {
            this.triggerDropAnimation(cell);
          }
        }
      }
    }

    // 2. Update ingestion gateway (incoming requested page)
    if (this.el.currentPageVal) {
      this.el.currentPageVal.textContent = step ? String(step.requestedPage) : '–';
    }
    if (this.el.currentPageBox) {
      this.el.currentPageBox.className = 'incoming-page-cell';
      if (step) {
        this.el.currentPageBox.classList.add(step.isHit ? 'hit-state' : 'fault-state');
      }
    }

    // 3. Update editorial narrative
    if (this.el.explanationText) {
      if (step) {
        this.el.explanationText.innerHTML = step.isHit
          ? `<strong>Page Hit.</strong> Page ${step.requestedPage} is already resident in Frame ${step.affectedFrameNumber}. No memory eviction required.`
          : step.isReplacement
            ? `<strong>Page Fault &amp; Eviction.</strong> Memory is full. Frame ${step.affectedFrameNumber} selected to evict Page ${step.evictedPage} under ${this.algorithm} policy.`
            : `<strong>Page Fault &amp; Allocation.</strong> Page ${step.requestedPage} loaded into empty Frame ${step.affectedFrameNumber}.`;

        if (this.el.explanationBox) {
          this.el.explanationBox.className = 'editorial-narrative-card ' + (step.isHit ? 'hit-narrative' : 'fault-narrative');
        }
      } else {
        this.el.explanationText.textContent = 'Press Next or Play to observe page ingestion and eviction decisions.';
        if (this.el.explanationBox) {
          this.el.explanationBox.className = 'editorial-narrative-card';
        }
      }
    }

    // 4. Update reference stream timeline
    if (this.el.timelineContainer) {
      const tokens = Array.from(this.el.timelineContainer.children);
      tokens.forEach((token, idx) => {
        const stepData = this.result.steps[idx];
        token.className = 'stream-token';

        if (idx > this.currentStepIndex) {
          token.classList.add('upcoming');
        } else {
          token.classList.add(stepData.isHit ? 'hit-token' : 'fault-token');
        }

        if (idx === this.currentStepIndex) {
          token.classList.add('active-token');
          token.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
    }

    // 5. Update progress rail and counter
    const currentStepNum = this.currentStepIndex + 1;
    const totalSteps = this.sequence.length;

    if (this.el.progressBar) {
      const pct = totalSteps > 0 ? (currentStepNum / totalSteps) * 100 : 0;
      this.el.progressBar.style.width = `${pct}%`;
    }
    if (this.el.stepCounter) {
      this.el.stepCounter.textContent = `Step ${currentStepNum} of ${totalSteps}`;
    }

    // 6. Update live metrics
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

    // 7. Update eviction archive (disk pool)
    if (this.el.diskContainer) {
      this.updateEvictionArchive();
    }

    // 8. Update cumulative fault sparkline
    if (this.el.faultCurveSvg) {
      this.renderFaultSparklineSvg();
    }

    // 9. Update navigation button disabled states
    if (this.el.btnPrev) this.el.btnPrev.disabled = this.currentStepIndex <= -1;
    if (this.el.btnNext) this.el.btnNext.disabled = this.currentStepIndex >= totalSteps - 1;
  }

  /**
   * Updates eviction archive with pages pushed out of physical memory.
   */
  updateEvictionArchive() {
    this.el.diskContainer.innerHTML = '';

    if (this.currentStepIndex < 0) {
      const emptyNote = document.createElement('span');
      emptyNote.className = 'archive-empty-note';
      emptyNote.textContent = 'No pages evicted yet.';
      this.el.diskContainer.appendChild(emptyNote);
      return;
    }

    const pastSteps = this.result.steps.slice(0, this.currentStepIndex + 1);
    const evictedSteps = pastSteps.filter(s => s.evictedPage !== null);

    if (evictedSteps.length === 0) {
      const emptyNote = document.createElement('span');
      emptyNote.className = 'archive-empty-note';
      emptyNote.textContent = 'No pages evicted yet.';
      this.el.diskContainer.appendChild(emptyNote);
      return;
    }

    // Show most recently evicted first
    evictedSteps.slice().reverse().forEach((s, idx) => {
      const chip = document.createElement('div');
      chip.className = 'archive-chip' + (idx === 0 ? ' latest-eviction' : '');

      const pageNum = document.createElement('span');
      pageNum.className = 'archive-page-num font-mono';
      pageNum.textContent = `P${s.evictedPage}`;

      const meta = document.createElement('span');
      meta.className = 'archive-meta';
      meta.textContent = `F${s.affectedFrameNumber}`;

      chip.appendChild(pageNum);
      chip.appendChild(meta);
      this.el.diskContainer.appendChild(chip);
    });
  }

  /**
   * Renders scientific fault accumulation sparkline in SVG.
   */
  renderFaultSparklineSvg() {
    const svg = this.el.faultCurveSvg;
    if (!svg || !this.result) return;

    const width = 600;
    const height = 110;
    const padding = { top: 16, right: 30, bottom: 20, left: 36 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const totalSteps = this.sequence.length;
    const maxFaults = Math.max(1, this.result.totalFaults);

    const getX = k => padding.left + ((k + 1) / totalSteps) * chartW;
    const getY = v => padding.top + chartH - (v / maxFaults) * chartH;

    const allSteps = this.result.steps;

    // Full trajectory dashed trace
    const totalPoints = [`${padding.left},${getY(0).toFixed(1)}`];
    allSteps.forEach((s, k) => {
      totalPoints.push(`${getX(k).toFixed(1)},${getY(s.cumulativeFaults).toFixed(1)}`);
    });

    // Active progress trace
    const currentPoints = [`${padding.left},${getY(0).toFixed(1)}`];
    if (this.currentStepIndex >= 0) {
      for (let k = 0; k <= this.currentStepIndex; k++) {
        currentPoints.push(`${getX(k).toFixed(1)},${getY(allSteps[k].cumulativeFaults).toFixed(1)}`);
      }
    }

    const currentStep = this.currentStepIndex >= 0 ? allSteps[this.currentStepIndex] : null;
    const currentX = this.currentStepIndex >= 0 ? getX(this.currentStepIndex) : padding.left;
    const currentY = this.currentStepIndex >= 0 ? getY(currentStep.cumulativeFaults) : getY(0);

    svg.innerHTML = `
      <!-- Base grid lines -->
      <line x1="${padding.left}" y1="${getY(0)}" x2="${padding.left + chartW}" y2="${getY(0)}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left + chartW}" y2="${padding.top}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
      
      <!-- Ghost full path -->
      <polyline points="${totalPoints.join(' ')}" fill="none" stroke="var(--border-strong)" stroke-width="1.5" stroke-dasharray="3,3" opacity="0.7"/>
      
      <!-- Active fault path -->
      <polyline points="${currentPoints.join(' ')}" fill="none" stroke="var(--fault)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      
      <!-- Active position dot -->
      <circle cx="${currentX.toFixed(1)}" cy="${currentY.toFixed(1)}" r="4.5" fill="var(--fault)" stroke="var(--surface)" stroke-width="2"/>
      
      <!-- Axis Labels -->
      <text x="${padding.left - 6}" y="${getY(0) + 4}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="var(--font-mono)">0</text>
      <text x="${padding.left - 6}" y="${padding.top + 4}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="var(--font-mono)">${maxFaults}</text>
      <text x="${padding.left + chartW}" y="${padding.top - 4}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="var(--font-mono)">Faults: ${currentStep ? currentStep.cumulativeFaults : 0} / ${this.result.totalFaults}</text>
    `;
  }

  triggerPulseAnimation(element) {
    element.classList.remove('anim-pulse-hit');
    void element.offsetWidth;
    element.classList.add('anim-pulse-hit');
  }

  triggerDropAnimation(element) {
    element.classList.remove('anim-drop-in');
    void element.offsetWidth;
    element.classList.add('anim-drop-in');
  }

  updatePlayButtonState(playing) {
    if (!this.el.btnPlay) return;
    this.el.btnPlay.textContent = playing ? 'Pause' : 'Play';
  }

  destroy() {
    this.pause();
  }
}
