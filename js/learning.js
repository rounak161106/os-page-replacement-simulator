/**
 * FrameLab - Educational Learning Module
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
        <div class="belady-card ${res3.totalFaults < res4.totalFaults ? 'anomaly-paradox' : ''}">
          <div class="belady-card-header">
            <h4>3 Physical Frames</h4>
            <span class="badge badge-primary">Fewer Frames</span>
          </div>
          <div class="belady-stat">
            <span class="stat-big font-mono">${res3.totalFaults}</span>
            <span class="stat-label">Page Faults</span>
          </div>
          <p class="mut text-sm">Fault Rate: ${res3.faultPercentage.toFixed(1)}% (${res3.totalReplacements} replacements)</p>
        </div>

        <div class="belady-card ${res4.totalFaults > res3.totalFaults ? 'anomaly-paradox' : ''}">
          <div class="belady-card-header">
            <h4>4 Physical Frames</h4>
            <span class="badge badge-warning">More Frames</span>
          </div>
          <div class="belady-stat">
            <span class="stat-big font-mono text-destructive">${res4.totalFaults}</span>
            <span class="stat-label">Page Faults</span>
          </div>
          <p class="mut text-sm">Fault Rate: ${res4.faultPercentage.toFixed(1)}% (${res4.totalReplacements} replacements)</p>
        </div>
      </div>

      <div class="callout callout-warning mt-4">
        <strong>Belady's Anomaly Observed!</strong>
        <p>Adding memory (from 3 frames to 4 frames) increased total page faults from <strong>${res3.totalFaults}</strong> to <strong>${res4.totalFaults}</strong>! This occurs because FIFO is not a "stack algorithm" — the set of pages in a 3-frame memory is not necessarily a subset of the pages in a 4-frame memory at any given point.</p>
        <p>In contrast, <strong>LRU</strong> and <strong>Optimal</strong> are mathematically proven stack algorithms and can never suffer from Belady's Anomaly.</p>
      </div>
    `;
  }
}
