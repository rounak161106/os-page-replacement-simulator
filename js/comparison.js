import { simulate } from './algorithms.js';

const ALGO_DISPLAY_CONFIG = [
  { key: 'FIFO', label: 'FIFO (First-In, First-Out)', short: 'FIFO', color: '#b93506', dash: '', marker: 'circle' },
  { key: 'LRU', label: 'LRU (Least Recently Used)', short: 'LRU', color: '#141518', dash: '7 4', marker: 'square' },
  { key: 'OPTIMAL', label: 'Optimal (Belady Lookahead)', short: 'OPT', color: '#047857', dash: '2 4', marker: 'diamond' }
];

export class ComparisonController {
  constructor(dom) {
    this.dom = dom;
    this.lastSummary = null;
    this.reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  }

  render(sequence, frameCount) {
    if (!Array.isArray(sequence) || sequence.length === 0) return;

    if (this.dom.cmpWorkloadBadge) {
      this.dom.cmpWorkloadBadge.textContent = `${sequence.length} refs · ${frameCount} Frames`;
    }
    if (this.dom.cmpNote) {
      this.dom.cmpNote.textContent = `FIFO, LRU, and Optimal evaluated identically across ${sequence.length} requests in ${frameCount} physical frame${frameCount > 1 ? 's' : ''}.`;
    }

    const total = sequence.length;
    const rows = ALGO_DISPLAY_CONFIG.map((cfg) => {
      const sim = simulate(cfg.key, sequence, frameCount);
      const steps = sim.steps || [];
      const last = steps[steps.length - 1];
      const faults = last ? last.cumulativeFaults : 0;
      const hits = last ? last.cumulativeHits : 0;
      const replacements = last ? last.cumulativeReplacements : 0;

      return {
        ...cfg,
        faults,
        hits,
        replacements,
        faultRate: total > 0 ? ((faults / total) * 100) : 0,
        hitRate: total > 0 ? ((hits / total) * 100) : 0,
        steps
      };
    });

    const minFaults = Math.min(...rows.map((r) => r.faults));
    this.lastSummary = rows;

    this.renderTable(rows, minFaults);
    this.renderBars(rows);
    this.renderTrajectorySvg(rows, sequence);
  }

  renderTable(rows, minFaults) {
    const tbody = this.dom.cmpTable?.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    rows.forEach((row) => {
      const tr = document.createElement('tr');
      const isBest = row.faults === minFaults;
      if (isBest) tr.classList.add('is-best-row');

      const nameTd = document.createElement('td');
      const nameWrap = document.createElement('div');
      nameWrap.className = 'algo-name-cell';

      const dot = document.createElement('span');
      dot.className = 'policy-dot';
      dot.style.backgroundColor = row.color;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = row.label;
      nameWrap.append(dot, labelSpan);

      if (isBest) {
        const bestTag = document.createElement('span');
        bestTag.className = 'best-badge';
        bestTag.textContent = 'BEST';
        nameWrap.appendChild(bestTag);
      }

      nameTd.appendChild(nameWrap);

      const faultsTd = document.createElement('td');
      faultsTd.textContent = String(row.faults);

      const hitsTd = document.createElement('td');
      hitsTd.textContent = String(row.hits);

      const repTd = document.createElement('td');
      repTd.textContent = String(row.replacements);

      const fRateTd = document.createElement('td');
      fRateTd.textContent = `${row.faultRate.toFixed(1)}%`;

      const hRateTd = document.createElement('td');
      hRateTd.textContent = `${row.hitRate.toFixed(1)}%`;

      tr.append(nameTd, faultsTd, hitsTd, repTd, fRateTd, hRateTd);
      tbody.appendChild(tr);
    });
  }

  renderBars(rows) {
    const host = this.dom.cmpBars;
    if (!host) return;
    host.innerHTML = '';

    const layersToAnimate = [];

    rows.forEach((row, idx) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'cmp-bar-row';

      const meta = document.createElement('div');
      meta.className = 'cmp-bar-meta';

      const title = document.createElement('span');
      title.className = 'cmp-bar-name';
      title.textContent = row.short;

      const figures = document.createElement('span');
      figures.className = 'cmp-bar-figures';
      figures.textContent = `${row.faults} faults (${row.faultRate.toFixed(1)}%) · ${row.hits} hits (${row.hitRate.toFixed(1)}%)`;

      meta.append(title, figures);

      const track = document.createElement('div');
      track.className = 'cmp-bar-track';
      track.setAttribute('role', 'img');
      track.setAttribute('aria-label', `${row.short}: ${row.faultRate.toFixed(1)} percent faults, ${row.hitRate.toFixed(1)} percent hits`);

      const faultLayer = document.createElement('div');
      faultLayer.className = 'cmp-bar-fault-layer';
      faultLayer.style.transitionDelay = this.reducedMotionQuery.matches ? '0ms' : `${idx * 70}ms`;
      const targetScale = Math.max(0, Math.min(1, row.faultRate / 100));
      track.appendChild(faultLayer);
      layersToAnimate.push({ el: faultLayer, scale: targetScale });

      const caption = document.createElement('div');
      caption.className = 'cmp-bar-caption';
      caption.innerHTML = '<span>Amber: Faults</span><span>Green: Hits</span>';

      wrapper.append(meta, track, caption);
      host.appendChild(wrapper);
    });

    requestAnimationFrame(() => {
      layersToAnimate.forEach(({ el, scale }) => {
        el.style.transform = `scaleX(${scale.toFixed(4)})`;
      });
    });
  }

  renderTrajectorySvg(rows, sequence) {
    const svg = this.dom.cmpTrajectorySvg;
    if (!svg) return;
    svg.innerHTML = '';

    const NS = 'http://www.w3.org/2000/svg';
    const W = 760;
    const H = 270;
    const padL = 44;
    const padR = 24;
    const padT = 22;
    const padB = 34;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;

    const totalSteps = sequence.length;
    const maxFaults = Math.max(1, ...rows.map((r) => r.faults));
    const reduceMotion = this.reducedMotionQuery.matches;

    const getX = (stepIdx) => padL + (totalSteps <= 1 ? plotW / 2 : (stepIdx / (totalSteps - 1)) * plotW);
    const getY = (faultCount) => padT + plotH - (faultCount / maxFaults) * plotH;

    const ticks = Math.min(5, maxFaults);
    for (let t = 0; t <= ticks; t += 1) {
      const val = Math.round((t / ticks) * maxFaults);
      const y = getY(val);

      const grid = document.createElementNS(NS, 'line');
      grid.setAttribute('x1', String(padL));
      grid.setAttribute('y1', y.toFixed(1));
      grid.setAttribute('x2', String(W - padR));
      grid.setAttribute('y2', y.toFixed(1));
      grid.setAttribute('stroke', t === 0 ? '#64748b' : '#d8e1ee');
      grid.setAttribute('stroke-width', '1');
      svg.appendChild(grid);

      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', String(padL - 8));
      label.setAttribute('y', (y + 4).toFixed(1));
      label.setAttribute('text-anchor', 'end');
      label.setAttribute('fill', '#475569');
      label.setAttribute('font-family', 'JetBrains Mono, monospace');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '600');
      label.textContent = String(val);
      svg.appendChild(label);
    }

    const labelEvery = totalSteps > 18 ? 2 : 1;
    sequence.forEach((page, idx) => {
      if (idx % labelEvery !== 0 && idx !== totalSteps - 1) return;
      const x = getX(idx);
      const label = document.createElementNS(NS, 'text');
      label.setAttribute('x', x.toFixed(1));
      label.setAttribute('y', String(H - 10));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', '#475569');
      label.setAttribute('font-family', 'JetBrains Mono, monospace');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '600');
      label.textContent = `${idx + 1}:P${page}`;
      svg.appendChild(label);
    });

    rows.forEach((row, seriesIdx) => {
      const pts = row.steps.map((s, idx) => `${getX(idx).toFixed(1)},${getY(s.cumulativeFaults).toFixed(1)}`).join(' ');
      const poly = document.createElementNS(NS, 'polyline');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', row.color);
      poly.setAttribute('stroke-width', '2.75');
      if (row.dash) poly.setAttribute('stroke-dasharray', row.dash);
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);

      // Animate continuous solid stroke drawing progressively left-to-right
      if (!reduceMotion && typeof poly.getTotalLength === 'function' && !row.dash) {
        const len = poly.getTotalLength();
        if (len > 0) {
          if (typeof window.gsap !== 'undefined') {
            window.gsap.fromTo(
              poly,
              { strokeDasharray: len, strokeDashoffset: len },
              { strokeDashoffset: 0, duration: 0.65, delay: seriesIdx * 0.1, ease: 'power2.out' }
            );
          } else {
            poly.animate(
              [
                { strokeDasharray: `${len}`, strokeDashoffset: `${len}` },
                { strokeDasharray: `${len}`, strokeDashoffset: '0' }
              ],
              { duration: 550, delay: seriesIdx * 90, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', fill: 'backwards' }
            );
          }
        }
      }

      row.steps.forEach((s, idx) => {
        const cx = getX(idx);
        const cy = getY(s.cumulativeFaults);
        let marker;
        if (row.marker === 'square') {
          marker = document.createElementNS(NS, 'rect');
          marker.setAttribute('x', (cx - 3.5).toFixed(1));
          marker.setAttribute('y', (cy - 3.5).toFixed(1));
          marker.setAttribute('width', '7');
          marker.setAttribute('height', '7');
        } else if (row.marker === 'diamond') {
          marker = document.createElementNS(NS, 'polygon');
          const d = 4.6;
          marker.setAttribute('points', `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`);
        } else {
          marker = document.createElementNS(NS, 'circle');
          marker.setAttribute('cx', cx.toFixed(1));
          marker.setAttribute('cy', cy.toFixed(1));
          marker.setAttribute('r', '4');
        }
        marker.setAttribute('fill', row.color);
        marker.setAttribute('stroke', '#ffffff');
        marker.setAttribute('stroke-width', '1.5');
        svg.appendChild(marker);
      });
    });

    const crosshair = document.createElementNS(NS, 'line');
    crosshair.setAttribute('y1', String(padT));
    crosshair.setAttribute('y2', String(H - padB));
    crosshair.setAttribute('class', 'cmp-crosshair-line');
    svg.appendChild(crosshair);

    const sliceW = totalSteps <= 1 ? plotW : plotW / (totalSteps - 1);
    sequence.forEach((page, idx) => {
      const cx = getX(idx);
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', Math.max(padL - sliceW / 2, cx - sliceW / 2).toFixed(1));
      rect.setAttribute('y', String(padT));
      rect.setAttribute('width', sliceW.toFixed(1));
      rect.setAttribute('height', String(plotH));
      rect.setAttribute('class', 'cmp-step-hotspot');
      rect.setAttribute('tabindex', '0');

      const summaryParts = rows.map((r) => `${r.short}: ${r.steps[idx]?.cumulativeFaults ?? 0}`);
      const readoutText = `Step ${idx + 1} (Page ${page}) · ${summaryParts.join(' · ')}`;
      rect.setAttribute('aria-label', readoutText);

      const activate = () => {
        crosshair.setAttribute('x1', cx.toFixed(1));
        crosshair.setAttribute('x2', cx.toFixed(1));
        crosshair.classList.add('is-active');
        if (this.dom.cmpChartReadout) {
          this.dom.cmpChartReadout.textContent = readoutText;
        }
      };

      const deactivate = () => {
        crosshair.classList.remove('is-active');
      };

      rect.addEventListener('mouseenter', activate);
      rect.addEventListener('focus', activate);
      rect.addEventListener('mouseleave', deactivate);
      rect.addEventListener('blur', deactivate);
      rect.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          deactivate();
          rect.blur();
        }
      });

      svg.appendChild(rect);
    });
  }
}
