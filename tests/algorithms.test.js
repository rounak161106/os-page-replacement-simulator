import test from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateFIFO,
  simulateLRU,
  simulateOptimal,
  simulate,
  ALGORITHMS,
  DECISIONS
} from '../js/algorithms.js';

test('Mandatory Verified Test Case: 7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2 with 3 frames', () => {
  const sequence = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
  const frames = 3;

  const fifo = simulateFIFO(sequence, frames);
  assert.equal(fifo.totalFaults, 10, 'FIFO faults must be 10');
  assert.equal(fifo.totalHits, 3, 'FIFO hits must be 3');
  assert.equal(fifo.totalReplacements, 7, 'FIFO replacements must be 7');

  const lru = simulateLRU(sequence, frames);
  assert.equal(lru.totalFaults, 9, 'LRU faults must be 9');
  assert.equal(lru.totalHits, 4, 'LRU hits must be 4');
  assert.equal(lru.totalReplacements, 6, 'LRU replacements must be 6');

  const opt = simulateOptimal(sequence, frames);
  assert.equal(opt.totalFaults, 7, 'Optimal faults must be 7');
  assert.equal(opt.totalHits, 6, 'Optimal hits must be 6');
  assert.equal(opt.totalReplacements, 4, 'Optimal replacements must be 4');
});

test('FIFO: Hits do not alter eviction order', () => {
  // Load 1, 2 into 2 frames.
  // Hit 1.
  // When 3 arrives, 1 was loaded earlier than 2, so 1 must be evicted despite being hit recently.
  const seq = [1, 2, 1, 3];
  const res = simulateFIFO(seq, 2);

  assert.equal(res.steps[0].decision, DECISIONS.LOAD); // 1 into F1
  assert.equal(res.steps[1].decision, DECISIONS.LOAD); // 2 into F2
  assert.equal(res.steps[2].decision, DECISIONS.HIT);  // 1 is hit in F1
  assert.equal(res.steps[3].decision, DECISIONS.REPLACE);
  assert.equal(res.steps[3].evictedPage, 1, 'FIFO must evict 1 because it was loaded first, hit does not reset timer');
  assert.equal(res.steps[3].affectedFrameIndex, 0);
});

test('LRU: Hits update access recency', () => {
  // Load 1, 2 into 2 frames.
  // Hit 1.
  // When 3 arrives, 2 is least recently used, so 2 must be evicted!
  const seq = [1, 2, 1, 3];
  const res = simulateLRU(seq, 2);

  assert.equal(res.steps[0].decision, DECISIONS.LOAD); // 1 into F1
  assert.equal(res.steps[1].decision, DECISIONS.LOAD); // 2 into F2
  assert.equal(res.steps[2].decision, DECISIONS.HIT);  // 1 hit in F1, access timestamp updated
  assert.equal(res.steps[3].decision, DECISIONS.REPLACE);
  assert.equal(res.steps[3].evictedPage, 2, 'LRU must evict 2 because 1 was accessed more recently');
  assert.equal(res.steps[3].affectedFrameIndex, 1);
});

test('Optimal: Selects page never used again, tie-breaking by lowest frame index', () => {
  // Frames: 3. Sequence: [10, 20, 30, 40]
  // 10 loaded in F0, 20 in F1, 30 in F2.
  // 40 arrives: none of 10, 20, 30 are used again.
  // Lowest index frame is F0 (page 10).
  const seq = [10, 20, 30, 40];
  const res = simulateOptimal(seq, 3);

  assert.equal(res.steps[3].decision, DECISIONS.REPLACE);
  assert.equal(res.steps[3].evictedPage, 10, 'When all are never used again, lowest frame index (F0) is evicted');
  assert.equal(res.steps[3].affectedFrameIndex, 0);
});

test('Single frame boundary condition (frameCount = 1)', () => {
  const seq = [1, 2, 1, 2, 3];
  const resFIFO = simulateFIFO(seq, 1);
  const resLRU = simulateLRU(seq, 1);
  const resOPT = simulateOptimal(seq, 1);

  assert.equal(resFIFO.totalFaults, 5);
  assert.equal(resFIFO.totalReplacements, 4); // First is load, rest are replacements
  assert.equal(resLRU.totalFaults, 5);
  assert.equal(resLRU.totalReplacements, 4);
  assert.equal(resOPT.totalFaults, 5);
});

test('Free frame filling vs Replacement invariant', () => {
  const seq = [1, 2, 3, 4];
  const res = simulateFIFO(seq, 3);

  // First 3 are loads into free frames, not replacements
  assert.equal(res.steps[0].isReplacement, false);
  assert.equal(res.steps[0].evictedPage, null);
  assert.equal(res.steps[1].isReplacement, false);
  assert.equal(res.steps[1].evictedPage, null);
  assert.equal(res.steps[2].isReplacement, false);
  assert.equal(res.steps[2].evictedPage, null);

  // 4th step is replacement
  assert.equal(res.steps[3].isReplacement, true);
  assert.equal(res.steps[3].evictedPage, 1);
  assert.equal(res.totalReplacements, 1);
  assert.equal(res.totalFaults, 4);
});

test('Immutability: Prior steps are never mutated', () => {
  const seq = [5, 6, 7, 8];
  const res = simulateFIFO(seq, 2);

  // Snapshot step 0's framesAfter
  const step0Frames = [...res.steps[0].framesAfter];
  assert.deepEqual(step0Frames, [5, null]);

  // Later step 3 changed memory to [7, 8]
  assert.deepEqual(res.steps[3].framesAfter, [7, 8]);
  // Step 0 must still be [5, null]
  assert.deepEqual(res.steps[0].framesAfter, [5, null]);
});
