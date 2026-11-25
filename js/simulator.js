const DEFAULT_STEP_MS = 1400;
const MIN_STEP_MS = 300;
const MAX_STEP_MS = 2800;

const ALGO_TITLES = {
  FIFO: 'Physical Memory Frames (FIFO: Evicts Oldest Loaded Page)',
  LRU: 'Physical Memory Frames (LRU: Evicts Least Recently Used Page)',
  OPTIMAL: 'Physical Memory Frames (Optimal: Evicts Farthest Future Use)'
};

export class SimulatorController {
  constructor(dom, options = {}) {
    this.dom = dom;
    this.onStatusChange = options.onStatusChange || null;
    this.onNotify = options.onNotify || null;
    this.onStateUpdate = options.onStateUpdate || null;

    this.algoKey = 'FIFO';
    this.frameCount = 3;
    this.sequence = [];
    this.steps = [];
    this.currentIndex = -1;
    this.previousCounts = { faults: 0, hits: 0, replacements: 0 };

    this.intervalMs = DEFAULT_STEP_MS;
    this.timerId = null;
    this.frameSlots = [];
    this.activeTimeline = null;
    this.activeFallbackTimers = [];
    this.activeFallbackAnims = [];
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

    this.bindEvents();
    this.setSpeedMs(DEFAULT_STEP_MS);
  }

  get isPlaying() {
    return this.timerId !== null;
  }

  get prefersReducedMotion() {
    return this.reducedMotionQuery.matches;
  }

  bindEvents() {
    this.dom.btnPrev?.addEventListener('click', () => this.prev());
    this.dom.btnPlay?.addEventListener('click', () => this.togglePlay());
    this.dom.btnNext?.addEventListener('click', () => this.next());
    this.dom.btnReset?.addEventListener('click', () => this.reset(true));

    this.dom.speedSlider?.addEventListener('input', (e) => {
      this.setSpeedMs(Number(e.target.value));
    });

    this.dom.speedPresetBtns?.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetMs = Number(btn.dataset.ms);
        if (!Number.isFinite(targetMs)) return;
        this.setSpeedMs(targetMs);
        if (this.onNotify) {
          this.onNotify(`Playback speed: ${btn.textContent.trim()} (${targetMs} ms/step)`, 'info');
        }
      });
    });

    window.addEventListener('resize', () => {
      const step = this.currentIndex >= 0 ? this.steps[this.currentIndex] : null;
      this.renderBusWiring(step, 'settled');
    });
  }

  setSpeedMs(rawMs) {
    const clamped = Math.max(MIN_STEP_MS, Math.min(MAX_STEP_MS, Math.round(rawMs)));
    this.intervalMs = clamped;

    if (this.dom.speedSlider) {
      this.dom.speedSlider.value = String(clamped);
      const pct = ((clamped - MIN_STEP_MS) / (MAX_STEP_MS - MIN_STEP_MS)) * 100;
      this.dom.speedSlider.style.setProperty('--slider-progress', `${pct.toFixed(2)}%`);
    }

    this.updateSpeedDisplay();

    if (this.isPlaying) {
      clearInterval(this.timerId);
      this.timerId = setInterval(() => this.tickAutoplay(), this.intervalMs);
    }

    if (this.onStatusChange) {
      this.onStatusChange({ algoKey: this.algoKey, frameCount: this.frameCount, intervalMs: this.intervalMs, isPlaying: this.isPlaying });
    }
    this.emitStateUpdate();
  }

  getSnapshot() {
    const step = this.currentIndex >= 0 ? this.steps[this.currentIndex] : null;
    return {
      currentIndex: this.currentIndex,
      totalSteps: this.steps.length,
      requestedPage: step ? step.requestedPage : null,
      decision: step ? step.decision : 'IDLE',
      affectedFrameIndex: step ? step.affectedFrameIndex : -1,
      affectedFrameNumber: step ? step.affectedFrameNumber : null,
      evictedPage: step ? step.evictedPage : null,
      frames: step ? [...step.framesAfter] : Array.from({ length: this.frameCount }, () => null),
      faults: step ? step.cumulativeFaults : 0,
      hits: step ? step.cumulativeHits : 0,
      replacements: step ? step.cumulativeReplacements : 0,
      explanation: step ? step.explanation : 'Frames are empty. Press Next Step or Play on your phone to begin.',
      isPlaying: this.isPlaying,
      algoKey: this.algoKey,
      frameCount: this.frameCount,
      intervalMs: this.intervalMs
    };
  }

  emitStateUpdate() {
    if (this.onStateUpdate) {
      this.onStateUpdate(this.getSnapshot());
    }
  }

  updateSpeedDisplay() {
    if (this.dom.speedTimingBadge) {
      this.dom.speedTimingBadge.textContent = `${this.intervalMs} ms`;
    }

    this.dom.speedPresetBtns?.forEach((btn) => {
      const btnMs = Number(btn.dataset.ms);
      btn.classList.toggle('active', btnMs === this.intervalMs);
    });
  }

  load(simulationResult, meta = {}) {
    this.pause();
    this.cancelMotion();

    this.algoKey = meta.algoKey || simulationResult.algorithm || 'FIFO';
    this.frameCount = meta.frameCount || simulationResult.frameCount || 3;
    this.sequence = Array.isArray(simulationResult.referenceSequence)
      ? simulationResult.referenceSequence
      : (meta.sequence || []);
    this.steps = Array.isArray(simulationResult.steps) ? simulationResult.steps : [];

    this.currentIndex = this.steps.length > 0 ? 0 : -1;
    this.previousCounts = { faults: 0, hits: 0, replacements: 0 };

    if (this.dom.framesSectionTitle) {
      this.dom.framesSectionTitle.textContent = ALGO_TITLES[this.algoKey] || ALGO_TITLES.FIFO;
    }

    this.buildFramesStructure();
    this.buildSequenceTape();
    this.buildMatrixStructure();
    this.updateView(false);

    if (this.onStatusChange) {
      this.onStatusChange({ algoKey: this.algoKey, frameCount: this.frameCount, intervalMs: this.intervalMs, isPlaying: false });
    }
  }

  play() {
    if (this.steps.length === 0 || this.isPlaying) return;

    if (this.currentIndex >= this.steps.length - 1) {
      this.goToStep(-1, false);
    }

    this.timerId = setInterval(() => this.tickAutoplay(), this.intervalMs);
    this.syncPlayButtonUI();
    if (this.onStatusChange) {
      this.onStatusChange({ algoKey: this.algoKey, frameCount: this.frameCount, intervalMs: this.intervalMs, isPlaying: true });
    }
    this.emitStateUpdate();
  }

  pause() {
    if (!this.isPlaying) return;
    clearInterval(this.timerId);
    this.timerId = null;
    this.syncPlayButtonUI();
    if (this.onStatusChange) {
      this.onStatusChange({ algoKey: this.algoKey, frameCount: this.frameCount, intervalMs: this.intervalMs, isPlaying: false });
    }
    this.emitStateUpdate();
  }

  togglePlay() {
    if (this.isPlaying) this.pause();
    else this.play();
  }

  tickAutoplay() {
    if (this.currentIndex < this.steps.length - 1) {
      this.currentIndex += 1;
      this.updateView(true);
    } else {
      this.pause();
      if (this.onNotify) {
        const last = this.steps[this.steps.length - 1];
        const summaryMsg = last
          ? `${this.algoKey} complete: ${last.cumulativeFaults} faults, ${last.cumulativeHits} hits`
          : 'Simulation complete';
        this.onNotify(summaryMsg, 'hit');
      }
    }
  }

  next() {
    this.pause();
    if (this.currentIndex < this.steps.length - 1) {
      this.currentIndex += 1;
      this.updateView(true);
    }
  }

  prev() {
    this.pause();
    if (this.currentIndex >= 0) {
      this.currentIndex -= 1;
      this.updateView(false);
    }
  }

  reset(notify = false) {
    this.pause();
    this.cancelMotion();
    this.currentIndex = -1;
    this.previousCounts = { faults: 0, hits: 0, replacements: 0 };
    this.updateView(false);
    if (notify && this.onNotify) {
      this.onNotify('Frames cleared to initial empty state', 'info');
    }
  }

  goToStep(index, animate = false) {
    this.pause();
    const bounded = Math.max(-1, Math.min(this.steps.length - 1, index));
    const singleForwardStep = bounded === this.currentIndex + 1;
    this.currentIndex = bounded;
    this.updateView(animate && singleForwardStep);
  }

  syncPlayButtonUI() {
    const playing = this.isPlaying;
    if (this.dom.streamPlayPill) {
      this.dom.streamPlayPill.hidden = !playing;
    }

    const btn = this.dom.btnPlay;
    if (!btn) return;
    btn.classList.toggle('is-playing', playing);
    btn.setAttribute('aria-label', playing ? 'Pause auto-step' : 'Play simulation');

    const iconPlay = btn.querySelector('.icon-play');
    const iconPause = btn.querySelector('.icon-pause');
    const label = btn.querySelector('.play-label');
    if (iconPlay) iconPlay.hidden = playing;
    if (iconPause) iconPause.hidden = !playing;
    if (label) label.textContent = playing ? 'Pause' : 'Play';
  }

  updateView(animate = false) {
    const total = this.steps.length;
    const step = this.currentIndex >= 0 ? this.steps[this.currentIndex] : null;
    const nextStep = this.currentIndex + 1 < total ? this.steps[this.currentIndex + 1] : null;

    this.cancelMotion();

    if (this.dom.stepCounter) {
      this.dom.stepCounter.textContent = `Step ${Math.max(0, this.currentIndex + 1)} / ${total}`;
    }
    if (this.dom.intakeStepLabel) {
      this.dom.intakeStepLabel.textContent = step ? `Step ${step.stepNumber}` : 'Ready';
    }
    if (this.dom.intakeNextPreview) {
      this.dom.intakeNextPreview.textContent = nextStep
        ? `Next: #${nextStep.stepNumber} -> P${nextStep.requestedPage}`
        : (total > 0 && this.currentIndex === total - 1 ? 'End of stream' : 'Ready to start');
    }
    if (this.dom.simProgress) {
      const progressRatio = total > 0 ? Math.max(0, this.currentIndex + 1) / total : 0;
      this.dom.simProgress.style.transform = `scaleX(${progressRatio.toFixed(4)})`;
    }

    if (this.dom.btnPrev) this.dom.btnPrev.disabled = this.currentIndex < 0;
    if (this.dom.btnNext) this.dom.btnNext.disabled = total === 0 || this.currentIndex >= total - 1;
    if (this.dom.btnPlay) this.dom.btnPlay.disabled = total === 0;

    this.syncPlayButtonUI();
    this.emitStateUpdate();

    if (!animate || !step || this.prefersReducedMotion || (this.isPlaying && this.intervalMs < 500)) {
      this.commitSettledVisuals(step, Boolean(animate && step && !this.prefersReducedMotion));
      return;
    }

    if (typeof window.gsap !== 'undefined') {
      this.runGsapBatonTimeline(step);
    } else {
      this.runFallbackBatonSequence(step);
    }
  }

  /**
   * Single-Actor Sequential Baton-Pass Motion Graphics via GSAP Timeline:
   * 1. "intake" -> Incoming Page arrives smoothly & wire draws cleanly to Target Frame
   * 2. "evict"  -> (Replace only) Old victim glides smoothly out first to clear slot
   * 3. "deliver"-> One hero token glides smoothly across the overhead arc into Target Frame
   * 4. "land"   -> Target Frame settles with final numeral, matrix column, narration & KPI tick
   */
  runGsapBatonTimeline(step) {
    const gsap = window.gsap;
    const prevStep = this.currentIndex > 0 ? this.steps[this.currentIndex - 1] : null;
    const prevVictimSlot = this.computeNextVictimSlot(prevStep, this.currentIndex - 1);

    // 1. Paint pre-step state BEFORE replacement happens
    this.setIntakeCheckingVisuals(step);
    this.updateSequenceTape(step, 'checking');
    this.renderMemoryFrames(step.framesBefore, prevStep, prevVictimSlot, { isPreState: true });
    if (this.dom.explanationBox && this.dom.explanationStepTag && this.dom.explanationText) {
      this.dom.explanationBox.className = 'narration-strip state-idle';
      this.dom.explanationStepTag.textContent = `Step ${step.stepNumber} · P${step.requestedPage}`;
      this.dom.explanationText.textContent = `Incoming Page ${step.requestedPage} queued — routing across overhead bus to Frame ${step.affectedFrameIndex + 1}...`;
    }

    const wireInfo = this.renderBusWiring(step, 'checking');
    const targetSlot = this.dom.framesContainer?.querySelector(`[data-frame-slot="${step.affectedFrameIndex}"]`);
    const victimNumEl = targetSlot?.querySelector('.frame-page-num');

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        this.activeTimeline = null;
      }
    });

    this.activeTimeline = tl;

    // Autoplay proportionally fits the timeline nicely inside intervalMs with calm pause between steps
    if (this.isPlaying) {
      const baseDur = step.isReplacement ? 1.25 : 0.90;
      const budget = Math.max(0.45, (this.intervalMs / 1000) * 0.85);
      if (budget < baseDur) {
        tl.timeScale(baseDur / budget);
      }
    }

    // BEAT 1 ("intake"): Smooth intake card rise + overhead wire draw + traveling signal dot
    tl.addLabel('intake', 0);
    if (this.dom.currentPageBox) {
      tl.fromTo(
        this.dom.currentPageBox,
        { y: 8, scale: 0.96, autoAlpha: 0.55 },
        { y: 0, scale: 1, autoAlpha: 1, duration: 0.25, clearProps: 'transform,opacity,visibility' },
        'intake'
      );
    }

    if (wireInfo?.activePath && wireInfo.svg) {
      const pathLen = wireInfo.activePath.getTotalLength();
      gsap.set(wireInfo.activePath, { strokeDasharray: pathLen, strokeDashoffset: pathLen });
      tl.to(wireInfo.activePath, { strokeDashoffset: 0, duration: 0.34, ease: 'power2.inOut' }, 'intake+=0.05');

      const NS = 'http://www.w3.org/2000/svg';
      const orb = document.createElementNS(NS, 'circle');
      orb.setAttribute('r', '4.5');
      orb.setAttribute('fill', step.isHit ? '#047857' : (step.isReplacement ? '#be123c' : '#b45309'));
      orb.setAttribute('stroke', '#ffffff');
      orb.setAttribute('stroke-width', '1.75');
      wireInfo.svg.appendChild(orb);

      const orbProxy = { progress: 0 };
      tl.to(
        orbProxy,
        {
          progress: 1,
          duration: 0.34,
          ease: 'power2.inOut',
          onUpdate: () => {
            const pt = wireInfo.activePath.getPointAtLength(orbProxy.progress * pathLen);
            orb.setAttribute('cx', pt.x.toFixed(1));
            orb.setAttribute('cy', pt.y.toFixed(1));
          },
          onComplete: () => orb.remove()
        },
        'intake+=0.05'
      );
    }

    // BEAT 2 ("evict"): ONLY when replacing — smoothly remove old page BEFORE delivering new page!
    if (step.isReplacement && targetSlot) {
      tl.addLabel('evict', '>-0.04');
      tl.call(() => {
        targetSlot.classList.add('is-victim-lock');
        const pill = targetSlot.querySelector('.frame-state-text');
        if (pill) pill.textContent = `EVICTING P${step.evictedPage}`;
        if (this.dom.explanationText) {
          this.dom.explanationText.textContent = `Frame ${step.affectedFrameIndex + 1} holds victim Page ${step.evictedPage}. Moving Page ${step.evictedPage} out to evicted log...`;
        }
      }, null, 'evict');

      if (victimNumEl) {
        tl.to(victimNumEl, { y: 20, autoAlpha: 0, duration: 0.28, ease: 'power2.in' }, 'evict');
      }

      tl.call(() => {
        this.updateEvictionArchive(step);
        const latestChip = this.dom.diskPoolList?.querySelector('.evict-chip.is-latest');
        if (latestChip) {
          gsap.fromTo(latestChip, { y: -10, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.26, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
        }
      }, null, 'evict+=0.18');
    }

    // BEAT 3 ("deliver"): Smooth single physical Page Token flight from Incoming -> Overhead -> Target Frame
    const deliverAt = step.isReplacement ? '>-0.02' : 'intake+=0.26';
    tl.addLabel('deliver', deliverAt);

    if (this.dom.currentPageBox && targetSlot) {
      const srcRect = this.dom.currentPageBox.getBoundingClientRect();
      const dstRect = targetSlot.getBoundingClientRect();
      const startX = srcRect.left + srcRect.width / 2 - 30;
      const startY = srcRect.top + srcRect.height / 2 - 22;
      const dx = dstRect.left + dstRect.width / 2 - 30 - startX;
      const dy = dstRect.top + dstRect.height / 2 - 22 - startY;

      const flightToken = document.createElement('div');
      const stateCls = step.isHit ? 'is-hit' : (step.isReplacement ? 'is-evict' : 'is-fault');
      flightToken.className = `waapi-flight-token ${stateCls}`;
      flightToken.textContent = `P${step.requestedPage}`;
      flightToken.style.left = `${startX}px`;
      flightToken.style.top = `${startY}px`;
      gsap.set(flightToken, { autoAlpha: 0, scale: 0.94 });
      document.body.appendChild(flightToken);

      tl.to(flightToken, { autoAlpha: 1, scale: 1, duration: 0.12 }, 'deliver');
      tl.to(flightToken, { x: dx, duration: 0.44, ease: 'power2.inOut' }, 'deliver');
      tl.to(
        flightToken,
        {
          keyframes: [
            { y: -28, scale: 1.08, duration: 0.20, ease: 'power2.out' },
            { y: dy, scale: 1, duration: 0.24, ease: 'power3.inOut' }
          ]
        },
        'deliver'
      );

      // BEAT 4 ("land"): Commit final RAM state smoothly right as token settles into Target Frame
      tl.addLabel('land', '>-0.06');
      tl.to(flightToken, { autoAlpha: 0, scale: 0.94, duration: 0.14, onComplete: () => flightToken.remove() }, 'land');
    } else {
      tl.addLabel('land', 'deliver');
    }

    tl.call(() => {
      this.commitSettledVisuals(step, true);
      const settledSlot = this.dom.framesContainer?.querySelector(`[data-frame-slot="${step.affectedFrameIndex}"]`);
      if (settledSlot) {
        const newNum = settledSlot.querySelector('.frame-page-num');
        if (newNum) {
          gsap.fromTo(newNum, { y: -8, autoAlpha: 0.25 }, { y: 0, autoAlpha: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
        }
        gsap.fromTo(settledSlot, { scale: 0.975 }, { scale: 1, duration: 0.24, ease: 'power3.out', clearProps: 'transform' });
      }
    }, null, 'land');
  }

  runFallbackBatonSequence(step) {
    const checkDelay = 240;
    const evictDelay = step.isReplacement ? 220 : 0;

    this.setIntakeCheckingVisuals(step);
    this.updateSequenceTape(step, 'checking');
    const prevStep = this.currentIndex > 0 ? this.steps[this.currentIndex - 1] : null;
    const prevVictimSlot = this.computeNextVictimSlot(prevStep, this.currentIndex - 1);
    this.renderMemoryFrames(step.framesBefore, prevStep, prevVictimSlot, { isPreState: true });
    this.renderBusWiring(step, 'checking');

    const t1 = setTimeout(() => {
      if (step.isReplacement) {
        this.updateEvictionArchive(step);
      }
    }, checkDelay);

    const t2 = setTimeout(() => {
      this.commitSettledVisuals(step, true);
    }, checkDelay + evictDelay);

    this.activeFallbackTimers.push(t1, t2);
  }

  setIntakeCheckingVisuals(step) {
    const box = this.dom.currentPageBox;
    const val = this.dom.currentPageVal;
    const badge = this.dom.currentDecisionBadge;
    if (!box || !val || !badge) return;

    box.className = 'intake-display state-checking';
    badge.className = 'outcome-pill state-checking';
    val.textContent = String(step.requestedPage);
    badge.textContent = 'Checking...';
  }

  commitSettledVisuals(step, animate) {
    const victimSlotIdx = this.computeNextVictimSlot(step, this.currentIndex);
    this.updateIntakeRegister(step);
    this.updateSequenceTape(step, 'settled');
    this.renderMemoryFrames(step ? step.framesAfter : Array(this.frameCount).fill(null), step, victimSlotIdx, { isPreState: false });
    this.updateEvictionArchive(step);
    this.updateMatrixStates(animate);
    this.updateExplanation(step);
    this.updateMetrics(step, animate);

    requestAnimationFrame(() => {
      this.renderBusWiring(step, 'settled');
    });
  }

  computeNextVictimSlot(step, refIndex) {
    if (!step) return -1;
    const frames = step.framesAfter || [];
    if (frames.some((p) => p === null)) return -1;

    const meta = step.metadata || {};
    if (this.algoKey === 'FIFO' && Array.isArray(meta.loadedStepSnapshot)) {
      let bestSlot = 0;
      let minLoaded = Infinity;
      for (let i = 0; i < frames.length; i += 1) {
        const val = meta.loadedStepSnapshot[i] ?? Infinity;
        if (val < minLoaded) {
          minLoaded = val;
          bestSlot = i;
        }
      }
      return bestSlot;
    }

    if (this.algoKey === 'LRU' && Array.isArray(meta.lastAccessSnapshot)) {
      let bestSlot = 0;
      let minAccess = Infinity;
      for (let i = 0; i < frames.length; i += 1) {
        const val = meta.lastAccessSnapshot[i] ?? Infinity;
        if (val < minAccess) {
          minAccess = val;
          bestSlot = i;
        }
      }
      return bestSlot;
    }

    if (this.algoKey === 'OPTIMAL') {
      let bestSlot = 0;
      let farthest = -1;
      for (let i = 0; i < frames.length; i += 1) {
        const page = frames[i];
        const nextIdx = this.sequence.indexOf(page, refIndex + 1);
        if (nextIdx === -1) return i;
        if (nextIdx > farthest) {
          farthest = nextIdx;
          bestSlot = i;
        }
      }
      return bestSlot;
    }

    return -1;
  }

  updateIntakeRegister(step) {
    const box = this.dom.currentPageBox;
    const val = this.dom.currentPageVal;
    const badge = this.dom.currentDecisionBadge;
    if (!box || !val || !badge) return;

    box.className = 'intake-display';
    badge.className = 'outcome-pill';

    if (!step) {
      box.classList.add('state-idle');
      badge.classList.add('state-idle');
      val.textContent = '--';
      badge.textContent = 'Ready';
      return;
    }

    val.textContent = String(step.requestedPage);
    if (step.isHit) {
      box.classList.add('state-hit');
      badge.classList.add('state-hit');
      badge.textContent = `HIT in Frame ${step.affectedFrameIndex + 1}`;
    } else if (step.isReplacement) {
      box.classList.add('state-replace');
      badge.classList.add('state-replace');
      badge.textContent = `EVICTED P${step.evictedPage}`;
    } else {
      box.classList.add('state-fault');
      badge.classList.add('state-fault');
      badge.textContent = `Loaded Frame ${step.affectedFrameIndex + 1}`;
    }
  }

  buildFramesStructure() {
    const container = this.dom.framesContainer;
    if (!container) return;
    container.innerHTML = '';
    this.frameSlots = [];

    for (let i = 0; i < this.frameCount; i += 1) {
      const cell = document.createElement('div');
      cell.className = 'memory-frame-cell frame-empty';
      cell.dataset.frameSlot = String(i);

      const topBar = document.createElement('div');
      topBar.className = 'frame-top-bar';

      const idSpan = document.createElement('span');
      idSpan.className = 'frame-id';
      idSpan.textContent = `Frame ${i + 1}`;

      const pillSpan = document.createElement('span');
      pillSpan.className = 'frame-state-text';
      pillSpan.textContent = 'Empty';
      topBar.append(idSpan, pillSpan);

      const core = document.createElement('div');
      core.className = 'frame-core';

      const numSpan = document.createElement('span');
      numSpan.className = 'frame-page-num';
      numSpan.textContent = '--';

      const swapSlot = document.createElement('div');
      swapSlot.className = 'frame-swap-slot';

      core.append(numSpan, swapSlot);

      const meta = document.createElement('div');
      meta.className = 'frame-meta';
      const metaLeft = document.createElement('span');
      metaLeft.textContent = 'Available';

      const metaRight = document.createElement('span');
      meta.append(metaLeft, metaRight);

      cell.append(topBar, core, meta);
      container.appendChild(cell);
      this.frameSlots.push({ cell, pillSpan, numSpan, swapSlot, metaLeft, metaRight });
    }
  }

  renderMemoryFrames(framesState, step, victimSlotIdx, { isPreState = false } = {}) {
    if (!this.dom.framesContainer) return;
    if (this.frameSlots.length !== this.frameCount) {
      this.buildFramesStructure();
    }

    const refIdx = isPreState ? this.currentIndex - 1 : this.currentIndex;

    for (let i = 0; i < this.frameCount; i += 1) {
      const slot = this.frameSlots[i];
      if (!slot) continue;

      const { cell, pillSpan, numSpan, swapSlot, metaLeft, metaRight } = slot;
      const pageVal = framesState?.[i] ?? null;
      const isAffected = !isPreState && step && step.affectedFrameIndex === i;
      const isVictimNext = pageVal !== null && i === victimSlotIdx && refIdx < this.steps.length - 1;

      if (typeof window.gsap !== 'undefined') {
        window.gsap.set([cell, numSpan], { clearProps: 'transform,opacity,visibility' });
      }

      cell.className = 'memory-frame-cell';
      let pillText = pageVal === null ? 'Empty' : 'In RAM';

      if (pageVal === null) {
        cell.classList.add('frame-empty');
      } else if (isAffected && step.isHit) {
        cell.classList.add('frame-hit');
        pillText = 'HIT';
      } else if (isAffected && step.isReplacement) {
        cell.classList.add('frame-replaced');
        pillText = 'REPLACED';
      } else if (isAffected && step.isFault) {
        cell.classList.add('frame-fault');
        pillText = 'LOADED';
      }

      if (!isPreState && isVictimNext) {
        cell.classList.add('is-next-victim');
      }

      pillSpan.textContent = pillText;
      numSpan.textContent = pageVal === null ? '--' : String(pageVal);

      if (isAffected && step.isReplacement && step.evictedPage !== null) {
        swapSlot.innerHTML = `<span class="frame-swap-diff"><span class="frame-swap-old">P${step.evictedPage}</span> &rarr; <span>P${pageVal}</span></span>`;
      } else {
        swapSlot.innerHTML = '';
      }

      metaLeft.textContent = this.formatSlotClue(step, i, pageVal, refIdx);

      if (isAffected && step.isReplacement && step.evictedPage !== null) {
        metaRight.className = 'frame-evict-note';
        metaRight.textContent = `Out: P${step.evictedPage}`;
      } else if (isVictimNext) {
        metaRight.className = 'frame-victim-note';
        metaRight.textContent = 'Evicts next';
      } else {
        metaRight.className = '';
        metaRight.textContent = '';
      }
    }
  }

  formatSlotClue(step, slotIdx, pageVal, refIdx) {
    if (pageVal === null) return 'Available';
    if (!step) return '';

    if (this.algoKey === 'OPTIMAL' && Array.isArray(this.sequence)) {
      const nextIdx = this.sequence.indexOf(pageVal, refIdx + 1);
      return nextIdx === -1 ? 'Never used again' : `Next use step ${nextIdx + 1}`;
    }

    const meta = step.metadata;
    if (meta && this.algoKey === 'LRU' && Array.isArray(meta.lastAccessSnapshot)) {
      const last = meta.lastAccessSnapshot[slotIdx];
      if (last !== null && last !== undefined) return `Used step ${last + 1}`;
    }

    if (meta && Array.isArray(meta.loadedStepSnapshot)) {
      const loaded = meta.loadedStepSnapshot[slotIdx];
      if (loaded !== null && loaded !== undefined) return `Loaded step ${loaded + 1}`;
    }

    return '';
  }

  renderBusWiring(step, phase = 'settled') {
    const svg = this.dom.busWiringSvg;
    const framesBox = this.dom.framesContainer;
    if (!svg || !framesBox) return null;

    svg.innerHTML = '';
    const svgRect = svg.getBoundingClientRect();
    if (svgRect.width <= 0 || svgRect.height <= 0) return null;

    const NS = 'http://www.w3.org/2000/svg';
    const slotEls = framesBox.querySelectorAll('[data-frame-slot]');
    const activeSlot = step ? step.affectedFrameIndex : -1;

    const startX = -10;
    const midY = 9;
    const endY = svgRect.height;
    let activePath = null;

    slotEls.forEach((slotEl, idx) => {
      const r = slotEl.getBoundingClientRect();
      const targetX = r.left + r.width / 2 - svgRect.left;
      const d = `M ${startX},${midY} L ${targetX.toFixed(1)},${midY} L ${targetX.toFixed(1)},${endY.toFixed(1)}`;

      const isTarget = idx === activeSlot;
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d);

      if (isTarget && step) {
        const cls = phase === 'checking'
          ? 'wire-check'
          : (step.isHit ? 'wire-hit' : (step.isReplacement ? 'wire-replace' : 'wire-fault'));
        path.setAttribute('class', `wire-active ${cls}`);
        activePath = path;
      } else {
        path.setAttribute('class', 'wire-idle');
      }

      svg.appendChild(path);
    });

    if (activePath) {
      svg.appendChild(activePath);
    }

    return { svg, activePath };
  }

  updateEvictionArchive(step) {
    const list = this.dom.diskPoolList;
    if (!list) return;
    list.innerHTML = '';

    if (this.currentIndex < 0) {
      list.innerHTML = '<span class="evict-empty-text">None</span>';
      return;
    }

    const evictedEntries = [];
    for (let i = 0; i <= this.currentIndex; i += 1) {
      const s = this.steps[i];
      if (s.isReplacement && s.evictedPage !== null && s.evictedPage !== undefined) {
        evictedEntries.push({
          page: s.evictedPage,
          stepNum: i + 1
        });
      }
    }

    if (evictedEntries.length === 0) {
      list.innerHTML = '<span class="evict-empty-text">None yet</span>';
      return;
    }

    evictedEntries.forEach((item, idx) => {
      const chip = document.createElement('span');
      chip.className = 'evict-chip';
      if (idx === evictedEntries.length - 1 && step?.isReplacement) {
        chip.classList.add('is-latest');
      }
      chip.textContent = `Page ${item.page} (step ${item.stepNum})`;
      list.appendChild(chip);
    });
  }

  buildSequenceTape() {
    const tape = this.dom.sequenceTape;
    if (!tape) return;
    tape.innerHTML = '';

    this.steps.forEach((s, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'seq-token';
      btn.dataset.seqStep = String(idx);
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', `Step ${idx + 1}, Page ${s.requestedPage}`);
      btn.innerHTML = `<span class="seq-token-idx">#${idx + 1}</span><span class="seq-token-val">${s.requestedPage}</span>`;
      btn.addEventListener('click', () => this.goToStep(idx, false));
      tape.appendChild(btn);
    });
  }

  updateSequenceTape(step, phase = 'settled') {
    const pill = this.dom.currentStreamPill;
    if (pill) {
      pill.className = 'seq-current-pill';
      if (!step) {
        pill.textContent = `Ready · ${this.steps.length} refs`;
      } else if (phase === 'checking') {
        pill.textContent = `Step ${step.stepNumber} · Page ${step.requestedPage}`;
      } else if (step.isHit) {
        pill.classList.add('is-hit');
        pill.textContent = `NOW · P${step.requestedPage} (HIT)`;
      } else if (step.isReplacement) {
        pill.classList.add('is-replace');
        pill.textContent = `NOW · P${step.requestedPage} (EVICT P${step.evictedPage})`;
      } else {
        pill.classList.add('is-fault');
        pill.textContent = `NOW · P${step.requestedPage} (FAULT)`;
      }
    }

    const tape = this.dom.sequenceTape;
    if (!tape) return;

    const tokens = tape.querySelectorAll('.seq-token');
    tokens.forEach((btn, idx) => {
      btn.classList.remove('is-current', 'is-done-hit', 'is-done-fault', 'is-done-replace');
      btn.removeAttribute('aria-current');

      if (idx === this.currentIndex) {
        btn.classList.add('is-current');
        btn.setAttribute('aria-current', 'step');
        btn.scrollIntoView({ behavior: this.prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
      } else if (idx < this.currentIndex) {
        const prev = this.steps[idx];
        if (prev?.isHit) btn.classList.add('is-done-hit');
        else if (prev?.isReplacement) btn.classList.add('is-done-replace');
        else if (prev) btn.classList.add('is-done-fault');
      }
    });
  }

  buildMatrixStructure() {
    const table = this.dom.traceMatrixTable;
    if (!table) return;
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');

    const cornerTh = document.createElement('th');
    cornerTh.scope = 'col';
    cornerTh.className = 'matrix-row-label';
    cornerTh.textContent = 'Request';
    headRow.appendChild(cornerTh);

    this.steps.forEach((s, idx) => {
      const th = document.createElement('th');
      th.scope = 'col';
      th.dataset.matrixCol = String(idx);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'matrix-col-btn';
      btn.setAttribute('aria-label', `Jump to Step ${idx + 1}, Page ${s.requestedPage}`);
      btn.innerHTML = `<span class="matrix-step-num">#${idx + 1}</span><span class="matrix-req-page">${s.requestedPage}</span>`;
      btn.addEventListener('click', () => this.goToStep(idx, false));

      th.appendChild(btn);
      headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    for (let f = 0; f < this.frameCount; f += 1) {
      const tr = document.createElement('tr');
      const labelTh = document.createElement('th');
      labelTh.scope = 'row';
      labelTh.className = 'matrix-row-label';
      labelTh.textContent = `Frame ${f + 1}`;
      tr.appendChild(labelTh);

      this.steps.forEach((_, idx) => {
        const td = document.createElement('td');
        td.className = 'matrix-cell is-pending';
        td.dataset.matrixCell = `${f}:${idx}`;
        td.textContent = '·';
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    }

    const statusRow = document.createElement('tr');
    const statusTh = document.createElement('th');
    statusTh.scope = 'row';
    statusTh.className = 'matrix-row-label';
    statusTh.textContent = 'Outcome';
    statusRow.appendChild(statusTh);

    this.steps.forEach((_, idx) => {
      const td = document.createElement('td');
      td.className = 'matrix-cell matrix-status-cell is-pending';
      td.dataset.matrixStatus = String(idx);
      td.textContent = '·';
      statusRow.appendChild(td);
    });

    tbody.appendChild(statusRow);
    table.appendChild(tbody);
  }

  updateMatrixStates(animate) {
    const table = this.dom.traceMatrixTable;
    if (!table) return;

    this.steps.forEach((stepData, colIdx) => {
      const th = table.querySelector(`th[data-matrix-col="${colIdx}"]`);
      const statusCell = table.querySelector(`td[data-matrix-status="${colIdx}"]`);
      const isCurrent = colIdx === this.currentIndex;
      const isVisible = colIdx <= this.currentIndex;

      if (th) {
        th.classList.toggle('is-current-col', isCurrent);
        if (isCurrent) {
          th.scrollIntoView({ behavior: this.prefersReducedMotion ? 'auto' : 'smooth', block: 'nearest', inline: 'center' });
        }
      }

      for (let f = 0; f < this.frameCount; f += 1) {
        const td = table.querySelector(`td[data-matrix-cell="${f}:${colIdx}"]`);
        if (!td) continue;

        td.classList.remove('is-pending', 'is-occupied', 'is-hit-cell', 'is-fault-cell', 'is-replace-cell', 'is-current-col');
        if (isCurrent) td.classList.add('is-current-col');

        if (!isVisible) {
          td.classList.add('is-pending');
          td.textContent = '·';
        } else {
          const val = stepData.framesAfter[f];
          td.textContent = val === null || val === undefined ? '-' : String(val);

          if (stepData.affectedFrameIndex === f) {
            if (stepData.isHit) td.classList.add('is-hit-cell');
            else if (stepData.isReplacement) td.classList.add('is-replace-cell');
            else td.classList.add('is-fault-cell');
          } else if (val !== null) {
            td.classList.add('is-occupied');
          }
        }
      }

      if (statusCell) {
        statusCell.classList.remove('is-pending', 'is-hit-cell', 'is-fault-cell', 'is-replace-cell', 'is-current-col', 'is-just-revealed');
        if (isCurrent) statusCell.classList.add('is-current-col');

        if (!isVisible) {
          statusCell.classList.add('is-pending');
          statusCell.textContent = '·';
        } else {
          if (stepData.isHit) {
            statusCell.classList.add('is-hit-cell');
            statusCell.textContent = 'HIT';
          } else if (stepData.isReplacement) {
            statusCell.classList.add('is-replace-cell');
            statusCell.textContent = 'EVICT';
          } else {
            statusCell.classList.add('is-fault-cell');
            statusCell.textContent = 'FAULT';
          }
          if (animate && isCurrent && !this.prefersReducedMotion) {
            void statusCell.offsetWidth;
            statusCell.classList.add('is-just-revealed');
          }
        }
      }
    });
  }

  updateExplanation(step) {
    const panel = this.dom.explanationBox;
    const text = this.dom.explanationText;
    const tag = this.dom.explanationStepTag;
    if (!panel || !text || !tag) return;

    panel.classList.remove('state-idle', 'state-hit', 'state-fault', 'state-replace');

    if (!step) {
      panel.classList.add('state-idle');
      tag.textContent = 'Ready';
      text.textContent = 'Frames are empty. Press Step, Play, or click any column below to run.';
      return;
    }

    tag.textContent = `Step ${step.stepNumber} · P${step.requestedPage}`;
    text.textContent = step.explanation || 'Step executed.';

    if (step.isHit) panel.classList.add('state-hit');
    else if (step.isReplacement) panel.classList.add('state-replace');
    else panel.classList.add('state-fault');
  }

  updateMetrics(step, animateDelta) {
    const faults = step ? step.cumulativeFaults : 0;
    const hits = step ? step.cumulativeHits : 0;
    const replacements = step ? step.cumulativeReplacements : 0;
    const processed = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;

    const faultRate = processed > 0 ? ((faults / processed) * 100).toFixed(1) : '0.0';
    const hitRate = processed > 0 ? ((hits / processed) * 100).toFixed(1) : '0.0';

    this.applyKpiTick(this.dom.statFaults, faults, this.previousCounts.faults, animateDelta);
    this.applyKpiTick(this.dom.statHits, hits, this.previousCounts.hits, animateDelta);
    this.applyKpiTick(this.dom.statReplacements, replacements, this.previousCounts.replacements, animateDelta);
    if (this.dom.statFaultRate) this.dom.statFaultRate.textContent = `${faultRate}%`;
    if (this.dom.statHitRate) this.dom.statHitRate.textContent = `${hitRate}%`;

    if (animateDelta && step) {
      this.flashDelta(this.dom.deltaFaults, faults - this.previousCounts.faults, '+1');
      this.flashDelta(this.dom.deltaHits, hits - this.previousCounts.hits, '+1');
      this.flashDelta(this.dom.deltaReplacements, replacements - this.previousCounts.replacements, '+1');
    }

    this.previousCounts = { faults, hits, replacements };
  }

  applyKpiTick(el, nextVal, prevVal, animateDelta) {
    if (!el) return;
    el.textContent = String(nextVal);
    if (animateDelta && nextVal > prevVal && !this.prefersReducedMotion) {
      el.classList.remove('is-ticking');
      void el.offsetWidth;
      el.classList.add('is-ticking');
    }
  }

  flashDelta(el, diff, label) {
    if (!el || diff <= 0) return;
    el.textContent = label;
    el.classList.remove('is-visible');
    void el.offsetWidth;
    el.classList.add('is-visible');
  }

  cancelMotion() {
    if (this.activeTimeline) {
      this.activeTimeline.kill();
      this.activeTimeline = null;
    }
    this.activeFallbackTimers.forEach((id) => clearTimeout(id));
    this.activeFallbackTimers = [];
    this.activeFallbackAnims.forEach((anim) => {
      try { anim.cancel(); } catch (_) { /* ignore finished animations */ }
    });
    this.activeFallbackAnims = [];
    document.querySelectorAll('.waapi-flight-token').forEach((el) => el.remove());
    if (typeof window.gsap !== 'undefined') {
      if (this.dom.currentPageBox) {
        window.gsap.set(this.dom.currentPageBox, { clearProps: 'transform,opacity,visibility' });
      }
      this.frameSlots.forEach(({ cell, numSpan }) => {
        window.gsap.set([cell, numSpan], { clearProps: 'transform,opacity,visibility' });
      });
    }
  }
}
