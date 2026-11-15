/**
 * FrameLab - Algorithm Comparison Module
 * Runs simultaneous simulations across FIFO, LRU, and Optimal algorithms,
 * renders metrics tables, comparative SVG bar charts, and fault trajectory curves.
 */

import { simulate, ALGORITHMS } from './algorithms.js';

const ALGO_DISPLAY_CONFIG = {
  [ALGORITHMS.FIFO]: {
    name: 'FIFO',
    title: 'First-In, First-Out',
    color: '#3b82f6', // Bright Blue
    dash: 'solid'
  },
  [ALGORITHMS.LRU]: {
    name: 'LRU',
    title: 'Least Recently Used',
    color: '#06b6d4', // Cyan / Teal
    dash: 'solid'
  },
  [ALGORITHMS.OPTIMAL]: {
    name: 'Optimal',
    title: 'Belady’s MIN (Theoretical)',
    color: '#10b981', // Emerald Green
    dash: 'solid'
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
      this.renderEmptyState('Please provide a valid reference string in the Simulator to run comparisons.');
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
        <th scope="col">Replacements</th>
        <th scope="col">Fault Rate</th>
        <th scope="col">Hit Rate</th>
        <th scope="col">Outcome</th>
      </tr>
    `;

    results.forEach(r => {
      const isWinner = r.sim.totalFaults === minFaults;
      const tr = document.createElement('tr');
      if (isWinner) tr.className = 'row-best';

      const tdAlgo = document.createElement('td');
      tdAlgo.innerHTML = `
        <div class="algo-name-cell">
          <span class="algo-color-swatch" style="background-color: ${r.config.color}"></span>
          <strong>${r.config.name}</strong>
          <span class="algo-subtitle">${r.config.title}</span>
        </div>
      `;

      const tdFaults = document.createElement('td');
      tdFaults.className = 'font-mono bold';
      tdFaults.textContent = String(r.sim.totalFaults);

      const tdHits = document.createElement('td');
      tdHits.className = 'font-mono';
      tdHits.textContent = String(r.sim.totalHits);

      const tdReplacements = document.createElement('td');
      tdReplacements.className = 'font-mono';
      tdReplacements.textContent = String(r.sim.totalReplacements);

      const tdFaultRate = document.createElement('td');
      tdFaultRate.className = 'font-mono';
      tdFaultRate.textContent = `${r.sim.faultPercentage.toFixed(1)}%`;

      const tdHitRate = document.createElement('td');
      tdHitRate.className = 'font-mono';
      tdHitRate.textContent = `${r.sim.hitPercentage.toFixed(1)}%`;

      const tdOutcome = document.createElement('td');
      if (isWinner) {
        tdOutcome.innerHTML = `<span class="badge badge-success">Fewest Faults (${r.sim.totalFaults})</span>`;
      } else {
        const delta = r.sim.totalFaults - minFaults;
        tdOutcome.innerHTML = `<span class="badge badge-neutral">+${delta} vs Best</span>`;
      }

      tr.appendChild(tdAlgo);
      tr.appendChild(tdFaults);
      tr.appendChild(tdHits);
      tr.appendChild(tdReplacements);
      tr.appendChild(tdFaultRate);
      tr.appendChild(tdHitRate);
      tr.appendChild(tdOutcome);
      tbody.appendChild(tr);
    });

    this.el.table.innerHTML = '';
    this.el.table.appendChild(thead);
    this.el.table.appendChild(tbody);
  }

  /**
   * Renders comparative SVG bar chart comparing Faults and Hits.
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
      row.className = 'comp-bar-row';

      const label = document.createElement('div');
      label.className = 'comp-bar-label';
      label.innerHTML = `<strong>${r.config.name}</strong><span>${r.sim.totalFaults} faults / ${r.sim.totalHits} hits</span>`;

      const track = document.createElement('div');
      track.className = 'comp-bar-track';

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

      // Animate width after DOM attachment
      requestAnimationFrame(() => {
        faultBar.style.width = `${(r.sim.totalFaults / totalRefs) * 100}%`;
        hitBar.style.width = `${(r.sim.totalHits / totalRefs) * 100}%`;
      });
    });
  }

  /**
   * Renders cumulative fault trajectory line chart across all algorithms in SVG.
   *
   * @param {Array} results
   * @param {number} totalRefs
   */
  renderTrajectorySvg(results, totalRefs) {
    const svg = this.el.curveSvg;
    if (!svg) return;

    const width = 640;
    const height = 240;
    const padding = { top: 24, right: 90, bottom: 36, left: 40 };
    const chartW = width - padding.left - padding.right;
    const chartH = height - padding.top - padding.bottom;

    const maxFaults = Math.max(1, ...results.map(r => r.sim.totalFaults));

    const getX = stepIdx => padding.left + ((stepIdx + 1) / totalRefs) * chartW;
    const getY = faults => padding.top + chartH - (faults / maxFaults) * chartH;

    // Gridlines and horizontal axes
    let gridLinesSvg = `
      <line x1="${padding.left}" y1="${getY(0)}" x2="${padding.left + chartW}" y2="${getY(0)}" stroke="var(--color-border)" stroke-width="1.5"/>
      <line x1="${padding.left}" y1="${getY(maxFaults)}" x2="${padding.left + chartW}" y2="${getY(maxFaults)}" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="3,3" opacity="0.6"/>
      <line x1="${padding.left}" y1="${getY(maxFaults / 2)}" x2="${padding.left + chartW}" y2="${getY(maxFaults / 2)}" stroke="var(--color-border)" stroke-width="1" stroke-dasharray="3,3" opacity="0.3"/>
    `;

    // Polylines for each algorithm
    const linesSvg = results.map((r, i) => {
      const points = [`${padding.left},${getY(0)}`];
      r.sim.steps.forEach((step, idx) => {
        points.push(`${getX(idx).toFixed(1)},${getY(step.cumulativeFaults).toFixed(1)}`);
      });

      const finalFaults = r.sim.totalFaults;
      const finalX = getX(totalRefs - 1);
      const finalY = getY(finalFaults);

      // Offset callout labels slightly to prevent overlap if scores match
      const labelYOffset = (i - 1) * 14;

      return `
        <polyline
          points="${points.join(' ')}"
          fill="none"
          stroke="${r.config.color}"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle cx="${finalX.toFixed(1)}" cy="${finalY.toFixed(1)}" r="4.5" fill="${r.config.color}" stroke="var(--color-card)" stroke-width="1.5" />
        <text
          x="${finalX + 8}"
          y="${(finalY + 4 + labelYOffset).toFixed(1)}"
          fill="${r.config.color}"
          font-size="11"
          font-weight="600"
          font-family="var(--font-mono)"
        >${r.config.name}: ${finalFaults}</text>
      `;
    }).join('');

    svg.innerHTML = `
      <g>
        ${gridLinesSvg}
        ${linesSvg}
        <!-- Axis labels -->
        <text x="${padding.left - 8}" y="${getY(0) + 4}" text-anchor="end" fill="var(--color-muted-foreground)" font-size="10" font-family="var(--font-mono)">0</text>
        <text x="${padding.left - 8}" y="${getY(maxFaults) + 4}" text-anchor="end" fill="var(--color-muted-foreground)" font-size="10" font-family="var(--font-mono)">${maxFaults}</text>
        <text x="${padding.left + chartW / 2}" y="${height - 8}" text-anchor="middle" fill="var(--color-muted-foreground)" font-size="11">Reference Sequence Progress &rarr;</text>
        <text x="${padding.left}" y="${padding.top - 8}" fill="var(--color-muted-foreground)" font-size="11">Cumulative Faults (lower is better)</text>
      </g>
    `;
  }

  /**
   * Renders empty state when inputs are invalid.
   * @param {string} message
   */
  renderEmptyState(message) {
    if (this.el.note) this.el.note.textContent = message;
    if (this.el.table) this.el.table.innerHTML = '';
    if (this.el.barsContainer) this.el.barsContainer.innerHTML = '';
    if (this.el.curveSvg) this.el.curveSvg.innerHTML = '';
  }
}
