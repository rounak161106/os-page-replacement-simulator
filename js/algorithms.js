/**
 * FrameLab - Page Replacement Algorithm Engine
 * Pure, deterministic implementations of FIFO, LRU, and Optimal algorithms.
 * Completely decoupled from the DOM.
 */

export const ALGORITHMS = Object.freeze({
  FIFO: 'FIFO',
  LRU: 'LRU',
  OPTIMAL: 'OPTIMAL'
});

export const DECISIONS = Object.freeze({
  HIT: 'HIT',
  LOAD: 'LOAD',
  REPLACE: 'REPLACE'
});

/**
 * Simulates First-In, First-Out (FIFO) page replacement.
 * Evicts the page that was loaded into memory earliest.
 * Page hits do NOT change loaded timestamps or queue order.
 *
 * @param {number[]} referenceSequence
 * @param {number} frameCount
 * @returns {SimulationResult}
 */
export function simulateFIFO(referenceSequence, frameCount) {
  return runSimulation(ALGORITHMS.FIFO, referenceSequence, frameCount);
}

/**
 * Simulates Least Recently Used (LRU) page replacement.
 * Evicts the page that has not been accessed for the longest time.
 * Every page hit updates that page's last access timestamp.
 *
 * @param {number[]} referenceSequence
 * @param {number} frameCount
 * @returns {SimulationResult}
 */
export function simulateLRU(referenceSequence, frameCount) {
  return runSimulation(ALGORITHMS.LRU, referenceSequence, frameCount);
}

/**
 * Simulates Optimal (Belady's MIN) page replacement.
 * Evicts the page whose next reference is farthest in the future.
 * A page never used again has next occurrence = Infinity.
 * If multiple candidates are equally eligible, chooses the lowest-index frame.
 *
 * @param {number[]} referenceSequence
 * @param {number} frameCount
 * @returns {SimulationResult}
 */
export function simulateOptimal(referenceSequence, frameCount) {
  return runSimulation(ALGORITHMS.OPTIMAL, referenceSequence, frameCount);
}

/**
 * Unified execution function for page replacement simulation.
 *
 * @param {'FIFO'|'LRU'|'OPTIMAL'|'OPT'} algoKey
 * @param {number[]} referenceSequence
 * @param {number} frameCount
 * @returns {SimulationResult}
 */
export function simulate(algoKey, referenceSequence, frameCount) {
  const normalizedKey = normalizeAlgorithmKey(algoKey);
  return runSimulation(normalizedKey, referenceSequence, frameCount);
}

/**
 * Normalizes user/UI algorithm keys to standard enum values.
 *
 * @param {string} key
 * @returns {'FIFO'|'LRU'|'OPTIMAL'}
 */
export function normalizeAlgorithmKey(key) {
  if (!key) return ALGORITHMS.FIFO;
  const upper = String(key).trim().toUpperCase();
  if (upper === 'OPT' || upper === 'OPTIMAL') return ALGORITHMS.OPTIMAL;
  if (upper === 'LRU') return ALGORITHMS.LRU;
  if (upper === 'FIFO') return ALGORITHMS.FIFO;
  throw new Error(`Unknown algorithm: "${key}". Supported algorithms are FIFO, LRU, OPTIMAL.`);
}

/**
 * Core deterministic simulation loop.
 *
 * @private
 * @param {'FIFO'|'LRU'|'OPTIMAL'} algorithm
 * @param {number[]} sequence
 * @param {number} frameCount
 * @returns {SimulationResult}
 */
function runSimulation(algorithm, sequence, frameCount) {
  if (!Array.isArray(sequence)) {
    throw new TypeError('Reference sequence must be an array of page numbers.');
  }
  if (!Number.isInteger(frameCount) || frameCount < 1) {
    throw new RangeError('Frame count must be a positive integer.');
  }

  // Memory frames: null indicates an unoccupied frame
  const frames = Array(frameCount).fill(null);

  // Tracking timestamps
  // loadedStep[k]: 0-based reference index when page currently in frame k was loaded
  const loadedStep = Array(frameCount).fill(-1);
  // lastAccessStep[k]: 0-based reference index when page currently in frame k was last referenced
  const lastAccessStep = Array(frameCount).fill(-1);

  const steps = [];
  let cumulativeHits = 0;
  let cumulativeFaults = 0;
  let cumulativeReplacements = 0;

  for (let stepIndex = 0; stepIndex < sequence.length; stepIndex++) {
    const page = sequence[stepIndex];
    const framesBefore = [...frames];
    const existingIndex = frames.indexOf(page);
    const isHit = existingIndex !== -1;

    let affectedFrameIndex = -1;
    let evictedPage = null;
    let decision = DECISIONS.HIT;
    let explanation = '';
    let isReplacement = false;
    let meta = {};

    if (isHit) {
      cumulativeHits++;
      affectedFrameIndex = existingIndex;
      decision = DECISIONS.HIT;

      // LRU updates last accessed timestamp upon a hit
      if (algorithm === ALGORITHMS.LRU) {
        lastAccessStep[affectedFrameIndex] = stepIndex;
      }
      // Note: FIFO does NOT update loadedStep or change queue order on a hit

      explanation = `Page ${page} is already in Frame ${affectedFrameIndex + 1}. Page Hit! Memory frames remain unchanged.`;
    } else {
      cumulativeFaults++;
      const freeFrameIndex = frames.indexOf(null);

      if (freeFrameIndex !== -1) {
        // Free frame available: page fault, but NOT a replacement
        affectedFrameIndex = freeFrameIndex;
        decision = DECISIONS.LOAD;
        isReplacement = false;

        frames[affectedFrameIndex] = page;
        loadedStep[affectedFrameIndex] = stepIndex;
        lastAccessStep[affectedFrameIndex] = stepIndex;

        explanation = `Page ${page} is not in memory (Page Fault). Frame ${affectedFrameIndex + 1} is empty, so Page ${page} is loaded without evicting any page.`;
      } else {
        // All frames are occupied: page fault AND replacement required
        cumulativeReplacements++;
        isReplacement = true;
        decision = DECISIONS.REPLACE;

        if (algorithm === ALGORITHMS.FIFO) {
          // Find the frame loaded earliest (minimum loadedStep)
          // If tie, choose lowest frame index
          let earliestIndex = 0;
          for (let m = 1; m < frameCount; m++) {
            if (loadedStep[m] < loadedStep[earliestIndex]) {
              earliestIndex = m;
            }
          }
          affectedFrameIndex = earliestIndex;
          evictedPage = frames[affectedFrameIndex];
          const loadedAtStep = loadedStep[affectedFrameIndex] + 1;
          explanation = `Page ${page} is missing and all ${frameCount} frames are occupied (Page Fault). FIFO selects Frame ${affectedFrameIndex + 1} to evict Page ${evictedPage}, which was loaded earliest (at step ${loadedAtStep}).`;
        } else if (algorithm === ALGORITHMS.LRU) {
          // Find the frame accessed least recently (minimum lastAccessStep)
          // If tie, choose lowest frame index
          let lruIndex = 0;
          for (let m = 1; m < frameCount; m++) {
            if (lastAccessStep[m] < lastAccessStep[lruIndex]) {
              lruIndex = m;
            }
          }
          affectedFrameIndex = lruIndex;
          evictedPage = frames[affectedFrameIndex];
          const lastUsedAtStep = lastAccessStep[affectedFrameIndex] + 1;
          explanation = `Page ${page} is missing and all ${frameCount} frames are occupied (Page Fault). LRU selects Frame ${affectedFrameIndex + 1} to evict Page ${evictedPage}, which was referenced least recently (at step ${lastUsedAtStep}).`;
        } else if (algorithm === ALGORITHMS.OPTIMAL) {
          // Optimal: look ahead into future references
          const nextOccurrences = frames.map(p => {
            const nextIdx = sequence.indexOf(p, stepIndex + 1);
            return nextIdx === -1 ? Infinity : nextIdx;
          });

          // Find frame whose next occurrence is farthest in the future
          // Tie-breaking rule: if multiple candidates are equally eligible, choose the lowest-index frame
          let optimalIndex = 0;
          for (let m = 1; m < frameCount; m++) {
            if (nextOccurrences[m] > nextOccurrences[optimalIndex]) {
              optimalIndex = m;
            }
          }

          affectedFrameIndex = optimalIndex;
          evictedPage = frames[affectedFrameIndex];
          const nextUse = nextOccurrences[affectedFrameIndex];

          meta.nextOccurrences = [...nextOccurrences];

          if (nextUse === Infinity) {
            explanation = `Page ${page} is missing and all ${frameCount} frames are occupied (Page Fault). Optimal selects Frame ${affectedFrameIndex + 1} to evict Page ${evictedPage} because it is never referenced again in the future.`;
          } else {
            explanation = `Page ${page} is missing and all ${frameCount} frames are occupied (Page Fault). Optimal selects Frame ${affectedFrameIndex + 1} to evict Page ${evictedPage} because its next reference is at step ${nextUse + 1}, farthest in the future.`;
          }
        }

        // Apply replacement to the selected frame
        frames[affectedFrameIndex] = page;
        loadedStep[affectedFrameIndex] = stepIndex;
        lastAccessStep[affectedFrameIndex] = stepIndex;
      }
    }

    const framesAfter = [...frames];

    steps.push(Object.freeze({
      stepNumber: stepIndex + 1,
      stepIndex,
      requestedPage: page,
      framesBefore,
      framesAfter,
      isHit,
      isFault: !isHit,
      isReplacement,
      affectedFrameIndex,
      affectedFrameNumber: affectedFrameIndex + 1,
      evictedPage,
      decision,
      explanation,
      cumulativeHits,
      cumulativeFaults,
      cumulativeReplacements,
      metadata: {
        ...meta,
        loadedStepSnapshot: [...loadedStep],
        lastAccessSnapshot: [...lastAccessStep]
      }
    }));
  }

  const totalReferences = sequence.length;
  const hitRatio = totalReferences === 0 ? 0 : cumulativeHits / totalReferences;
  const faultRatio = totalReferences === 0 ? 0 : cumulativeFaults / totalReferences;
  const hitPercentage = hitRatio * 100;
  const faultPercentage = faultRatio * 100;

  return Object.freeze({
    algorithm,
    frameCount,
    referenceSequence: [...sequence],
    totalReferences,
    totalHits: cumulativeHits,
    totalFaults: cumulativeFaults,
    totalReplacements: cumulativeReplacements,
    hitRatio,
    faultRatio,
    hitPercentage,
    faultPercentage,
    steps: Object.freeze(steps)
  });
}
