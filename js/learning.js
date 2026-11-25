import { simulate } from './algorithms.js';

const BELADY_SEQUENCE = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

export class LearningController {
  constructor(dom, options = {}) {
    this.dom = dom;
    this.onLoadBeladyPreset = options.onLoadBeladyPreset || null;
    this.onNotify = options.onNotify || null;

    this.bindEvents();
  }

  bindEvents() {
    this.dom.btnTestBelady?.addEventListener('click', () => {
      this.runBeladyProof(true);
    });

    this.dom.btnLoadBelady?.addEventListener('click', () => {
      if (this.onLoadBeladyPreset) {
        this.onLoadBeladyPreset([...BELADY_SEQUENCE], 4, 'FIFO');
      }
    });
  }

  runBeladyProof(notify = false) {
    const result3 = simulate('FIFO', BELADY_SEQUENCE, 3);
    const result4 = simulate('FIFO', BELADY_SEQUENCE, 4);

    const faults3 = result3.steps[result3.steps.length - 1]?.cumulativeFaults ?? 0;
    const faults4 = result4.steps[result4.steps.length - 1]?.cumulativeFaults ?? 0;
    const hits3 = result3.steps[result3.steps.length - 1]?.cumulativeHits ?? 0;
    const hits4 = result4.steps[result4.steps.length - 1]?.cumulativeHits ?? 0;
    const diff = faults4 - faults3;

    const host = this.dom.beladyResultBox;
    if (!host) return;

    host.hidden = false;
    host.classList.remove('is-revealing');
    void host.offsetWidth;
    host.classList.add('is-revealing');

    host.innerHTML = `
      <div class="belady-case">
        <div class="belady-case-top">
          <span class="belady-case-title">3 Physical Frames (FIFO)</span>
          <span class="mono-badge">Baseline</span>
        </div>
        <span class="belady-case-value">${faults3} Page Faults</span>
        <span class="belady-case-sub">${hits3} Page Hits across ${BELADY_SEQUENCE.length} requests</span>
      </div>
      <div class="belady-case ${faults4 > faults3 ? 'is-anomaly' : ''}">
        <div class="belady-case-top">
          <span class="belady-case-title">4 Physical Frames (FIFO)</span>
          <span class="mono-badge">+33% RAM</span>
        </div>
        <span class="belady-case-value">${faults4} Page Faults</span>
        <span class="belady-case-sub">${hits4} Page Hits across ${BELADY_SEQUENCE.length} requests</span>
      </div>
      <div class="belady-verdict-banner">
        <span>Adding a 4th frame alters queue eviction at step 7 and increases total page faults on this stream.</span>
        <span class="belady-delta-badge">${diff > 0 ? `+${diff} FAULT` : `${diff} DELTA`} ANOMALY PROVEN</span>
      </div>
    `;

    if (notify && this.onNotify) {
      this.onNotify(`Belady verification executed: 3 frames = ${faults3} faults vs 4 frames = ${faults4} faults`, 'fault');
    }
  }
}
