/**
 * FrameLab — Memory Atlas Comparison Module
 * Runs simultaneous simulations across FIFO, LRU, and Optimal algorithms,
 * renders metrics tables, comparative bar tracks, and fault trajectory curves.
 */

import { simulate, ALGORITHMS } from './algorithms.js';

const ALGO_DISPLAY_CONFIG = {
  [ALGORITHMS.FIFO]: {
    name: 'FIFO',
    title: 'First-In, First-Out',
    color: '#3859D6' // Primary Blue
  },
  [ALGORITHMS.LRU]: {
    name: 'LRU',
    title: 'Least Recently Used',
    color: '#087F72' // Scientific Teal
  },
  [ALGORITHMS.OPTIMAL]: {
    name: 'Optimal',
    title: 'Belady’s MIN (Theoretical)',
    color: '#8762B8' // Scientific Violet
  }
};

export class ComparisonController {
  /**
   * @param {object} elements - Container DOM elements
   */
  constructor(elements) {
    this.el = elements;
  }

  /**
   * Runs all three algorithms on the provided sequence and updates the comparison views.
   *
   * @param {number[]} sequence
   * @param {number} frameCount
   */
  render(sequence, frameCount) {
    if (!sequence || sequence.length === 0) {
      this.renderEmptyState('Enter a valid reference sequence in the Simulator to run comparisons.');
      return;
    }

    const algos = [ALGORITHMS.FIFO, ALGORITHMS.LRU, ALGORITHMS.OPTIMAL];
    const results = algos.map(algo => ({
      key: algo,
      config: ALGO_DISPLAY_CONFIG[algo],
      sim: simulate(algo, sequence, frameCount)
    }));

    // Find lowest fault count
    const minFaults = Math.min(...results.map(r => r.sim.totalFaults));

    this.renderSummaryNote(sequence.length, frameCount);
    this.renderTable(results, minFaults, sequence.length);
    this.renderBarChartSvg(results, sequence.length);
    this.renderTrajectorySvg(results, sequence.length);
  }

  /**
   * Renders informational banner above comparison data.
   *
   * @param {number} refCount
   * @param {number} frameCount
   */
  renderSummaryNote(refCount, frameCount) {
    if (!this.el.note) return;
    this.el.note.textContent = `Compared over ${refCount} page references with ${frameCount} physical memory frames. All figures are dynamically calculated from identical inputs.`;
  }

  /**
   * Renders the comparative metrics table.
   *
   * @param {Array} results
   * @param {number} minFaults
   * @param {number} totalRefs
   */
  renderTable(results, minFaults, totalRefs) {
    if (!this.el.table) return;

    const tbody = document.createElement('tbody');

    // Header
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        <th scope="col">Algorithm</th>
        <th scope="col">Faults</th>
        <th scope="col">Hits</th>
        <th scope="col">Fault Rate</th>
        <th scope="col">Hit Rate</th>
        <th scope="col">Replacements</th>
        <th scope="col">Outcome</th>
      </tr>
    `;

    results.forEach(r => {
      const isWinner = r.sim.totalFaults === minFaults;
      const tr = document.createElement('tr');
      if (isWinner) tr.className = 'row-best';

      const tdAlgo = document.createElement('td');
      tdAlgo.className = 'algo-cell';
      tdAlgo.innerHTML = `
        <div class="algo-swatch-badge">
          <span class="algo-swatch-dot" style="background-color: ${r.config.color}"></span>
          <strong>${r.config.name}</strong>
        </div>
      `;

      const tdFaults = document.createElement('td');
      tdFaults.className = 'font-mono bold';
      tdFaults.textContent = String(r.sim.totalFaults);

      const tdHits = document.createElement('td');
      tdHits.className = 'font-mono';
      tdHits.textContent = String(r.sim.totalHits);

      const tdFaultRate = document.createElement('td');
      tdFaultRate.className = 'font-mono';
      tdFaultRate.textContent = `${r.sim.faultPercentage.toFixed(1)}%`;

      const tdHitRate = document.createElement('td');
      tdHitRate.className = 'font-mono';
      tdHitRate.textContent = `${r.sim.hitPercentage.toFixed(1)}%`;

      const tdReplacements = document.createElement('td');
      tdReplacements.className = 'font-mono';
      tdReplacements.textContent = String(r.sim.totalReplacements);

      const tdOutcome = document.createElement('td');
      if (isWinner) {
        tdOutcome.innerHTML = `<span class="badge badge-hit">Optimal Baseline</span>`;
      } else {
        const delta = r.sim.totalFaults - minFaults;
        tdOutcome.innerHTML = `<span class="badge badge-neutral">+${delta} vs Best</span>`;
      }

      tr.appendChild(tdAlgo);
      tr.appendChild(tdFaults);
      tr.appendChild(tdHits);
      tr.appendChild(tdFaultRate);
      tr.appendChild(tdHitRate);
      tr.appendChild(tdReplacements);
      tr.appendChild(tdOutcome);
      tbody.appendChild(tr);
    });

    this.el.table.innerHTML = '';
    this.el.table.appendChild(thead);
    this.el.table.appendChild(tbody);
  }

  /**
   * Renders comparative proportional bars.
   *
   * @param {Array} results
   * @param {number} totalRefs
   */
  renderBarChartSvg(results, totalRefs) {
    const container = this.el.barsContainer;
    if (!container) return;

    container.innerHTML = '';

    results.forEach(r => {
      const row = document.createElement('div');
      row.className = 'comp-bar-item';

      const label = document.createElement('div');
      label.className = 'comp-bar-name';
      label.textContent = r.config.name;

      const track = document.createElement('div');
      track.className = 'comp-bar-track-shell';

      const faultBar = document.createElement('div');
      faultBar.className = 'comp-bar-fill-fault';
      faultBar.style.width = '0%';
      faultBar.setAttribute('aria-label', `${r.config.name} Faults: ${r.sim.totalFaults}`);

      const hitBar = document.createElement('div');
      hitBar.className = 'comp-bar-fill-hit';
      hitBar.style.width = '0%';
      hitBar.setAttribute('aria-label', `${r.config.name} Hits: ${r.sim.totalHits}`);

      track.appendChild(faultBar);
      track.appendChild(hitBar);

      const readout = document.createElement('div');
      readout.className = 'comp-bar-readout font-mono';
      readout.textContent = `${r.sim.faultPercentage.toFixed(1)}% fault`;

      row.appendChild(label);
      row.appendChild(track);
      row.appendChild(readout);
      container.appendChild(row);

      // Animate width
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          faultBar.style.width = `${(r.sim.totalFaults / totalRefs) * 100}%`;
          hitBar.style.width = `${(r.sim.totalHits / totalRefs) * 100}%`;
        });
      });
    });
  }

  /**
   * Renders cumulative fault trajectory line chart in SVG matching Memory Atlas styling.
   *
   * @param {Array} results
   * @param {number} totalRefs
   */
  renderTrajectorySvg(results, totalRefs) {
    const svg = this.el.curveSvg;
    if (!svg) return;

    const width = 640;
    const height = 220;
    const padding = { top: 24, right: 90, bottom: 28, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxFaults = Math.max(1, ...results.map(r => r.sim.totalFaults));

    const getX = stepIdx => padding.left + ((stepIdx + 1) / totalRefs) * chartW;
    const getY = faults => padding.top + chartH - (faults / maxFaults) * chartH;

    let gridLinesSvg = `
      <line x1="${padding.left}" y1="${getY(0)}" x2="${padding.left + chartW}" y2="${getY(0)}" stroke="var(--border)" stroke-width="1"/>
      <line x1="${padding.left}" y1="${getY(maxFaults)}" x2="${padding.left + chartW}" y2="${getY(maxFaults)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
    `;

    const linesSvg = results.map((r, j) => {
      const points = [`${padding.left},${getY(0)}`];
      r.sim.steps.forEach((step, idx) => {
        points.push(`${getX(idx).toFixed(1)},${getY(step.cumulativeFaults).toFixed(1)}`);
      });

      const finalFaults = r.sim.totalFaults;
      const finalX = getX(totalRefs - 1);
      const finalY = getY(finalFaults);
      const labelYOffset = (j - 1) * 16;

      return `
        <polyline
          class="crv"
          pathLength="1"
          points="${points.join(' ')}"
          fill="none"
          stroke="${r.config.color}"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
          style="animation-delay: ${j * 0.15}s"
        />
        <circle cx="${finalX.toFixed(1)}" cy="${finalY.toFixed(1)}" r="4.5" fill="${r.config.color}" stroke="var(--surface)" stroke-width="2"/>
        <text
          x="${finalX + 8}"
          y="${(finalY + 4 + labelYOffset).toFixed(1)}"
          fill="${r.config.color}"
          font-size="11"
          font-weight="700"
          font-family="var(--font-mono)"
        >${r.config.name}: ${finalFaults}</text>
      `;
    }).join('');

    svg.innerHTML = `
      <g>
        ${gridLinesSvg}
        ${linesSvg}
        <text x="${padding.left - 8}" y="${getY(0) + 4}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="var(--font-mono)">0</text>
        <text x="${padding.left - 8}" y="${getY(maxFaults) + 4}" text-anchor="end" fill="var(--text-secondary)" font-size="10" font-family="var(--font-mono)">${maxFaults}</text>
        <text x="${padding.left + chartW / 2}" y="${height - 6}" text-anchor="middle" fill="var(--text-tertiary)" font-size="10">Page Reference Sequence Progress &rarr;</text>
      </g>
    `;
  }

  renderEmptyState(message) {
    if (this.el.note) this.el.note.textContent = message;
    if (this.el.table) this.el.table.innerHTML = '';
    if (this.el.barsContainer) this.el.barsContainer.innerHTML = '';
    if (this.el.curveSvg) this.el.curveSvg.innerHTML = '';
  }
}
