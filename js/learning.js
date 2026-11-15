/**
 * FrameLab — Memory Atlas Educational Learning Module
 * Provides algorithm theory, trade-off analysis, time complexity profiles,
 * and an interactive Belady's Anomaly demonstration.
 */

import { simulateFIFO } from './algorithms.js';

export class LearningController {
  /**
   * @param {object} elements
   * @param {Function} [onLoadBeladyPreset] - Callback when user clicks to load Belady preset into simulator
   */
  constructor(elements, onLoadBeladyPreset) {
    this.el = elements;
    this.onLoadBeladyPreset = onLoadBeladyPreset;
    this.bindEvents();
  }

  bindEvents() {
    if (this.el.btnLoadBelady && this.onLoadBeladyPreset) {
      this.el.btnLoadBelady.addEventListener('click', () => {
        const canonicalSequence = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
        this.onLoadBeladyPreset(canonicalSequence, 3);
      });
    }

    if (this.el.btnTestBelady) {
      this.el.btnTestBelady.addEventListener('click', () => {
        this.runBeladyProof();
      });
    }
  }

  /**
   * Renders the interactive Belady's Anomaly proof comparing 3 frames vs 4 frames.
   */
  runBeladyProof() {
    const sequence = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];
    const res3 = simulateFIFO(sequence, 3);
    const res4 = simulateFIFO(sequence, 4);

    if (!this.el.beladyResultBox) return;

    this.el.beladyResultBox.innerHTML = `
      <div class="belady-comparison-grid">
        <div class="belady-result-card">
          <div class="article-header">
            <h4>3 Physical Frames</h4>
            <span class="badge badge-neutral">Baseline</span>
          </div>
          <div class="belady-stat-readout">
            <span class="belady-num font-mono">${res3.totalFaults}</span>
            <span class="text-xs mut">Page Faults (${res3.faultPercentage.toFixed(1)}%)</span>
          </div>
          <p class="mut text-xs">${res3.totalReplacements} memory evictions across 12 references.</p>
        </div>

        <div class="belady-result-card paradox-card">
          <div class="article-header">
            <h4>4 Physical Frames</h4>
            <span class="badge badge-fault">Anomaly Paradox</span>
          </div>
          <div class="belady-stat-readout">
            <span class="belady-num fault-count font-mono">${res4.totalFaults}</span>
            <span class="text-xs mut">Page Faults (${res4.faultPercentage.toFixed(1)}%)</span>
          </div>
          <p class="mut text-xs">${res4.totalReplacements} memory evictions across 12 references.</p>
        </div>
      </div>

      <div class="callout callout-warning mt-4">
        <strong>Belady's Anomaly Verified:</strong>
        <p>Allocating <em>more</em> physical memory (increasing from 3 frames to 4 frames) paradoxically increased page faults from <strong>${res3.totalFaults}</strong> to <strong>${res4.totalFaults}</strong>! This occurs because FIFO is not a "stack algorithm": the set of pages resident in an n-frame store is not guaranteed to be a strict subset of an (n+1)-frame store.</p>
        <p>In contrast, <strong>LRU</strong> and <strong>Optimal</strong> are mathematically proven stack algorithms and are permanently immune to Belady's Anomaly.</p>
      </div>
    `;
  }
}
