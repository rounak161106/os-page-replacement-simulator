import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, simulateFIFO, simulateLRU, simulateOptimal, ALGORITHMS } from '../js/algorithms.js';
import { validateReferenceString, validateFrameCount } from '../js/validation.js';

test('Integration: Belady Anomaly canonical proof & stack algorithm immunity', () => {
  const beladySeq = [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5];

  // FIFO suffers from Belady's Anomaly: 4 frames has MORE faults than 3 frames
  const fifo3 = simulateFIFO(beladySeq, 3);
  const fifo4 = simulateFIFO(beladySeq, 4);
  assert.equal(fifo3.totalFaults, 9, 'FIFO with 3 frames should have 9 faults');
  assert.equal(fifo4.totalFaults, 10, 'FIFO with 4 frames should have 10 faults');
  assert.ok(fifo4.totalFaults > fifo3.totalFaults, 'FIFO must exhibit Belady anomaly for this sequence');

  // LRU is a stack algorithm: 4 frames must have fewer or equal faults than 3 frames
  const lru3 = simulateLRU(beladySeq, 3);
  const lru4 = simulateLRU(beladySeq, 4);
  assert.equal(lru3.totalFaults, 10);
  assert.equal(lru4.totalFaults, 8);
  assert.ok(lru4.totalFaults <= lru3.totalFaults, 'LRU is immune to Belady anomaly');

  // Optimal is a stack algorithm: 4 frames must have fewer or equal faults than 3 frames
  const opt3 = simulateOptimal(beladySeq, 3);
  const opt4 = simulateOptimal(beladySeq, 4);
  assert.equal(opt3.totalFaults, 7);
  assert.equal(opt4.totalFaults, 6);
  assert.ok(opt4.totalFaults <= opt3.totalFaults, 'Optimal is immune to Belady anomaly');
});

test('Integration: Optimal is always lower or equal in faults to FIFO and LRU', () => {
  const sequences = [
    [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2],
    [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
    [2, 3, 2, 1, 5, 2, 4, 5, 3, 2, 5, 2],
    [0, 1, 2, 3, 0, 1, 4, 0, 1, 2, 3, 4]
  ];

  for (const seq of sequences) {
    for (let f = 1; f <= 5; f++) {
      const fifo = simulate(ALGORITHMS.FIFO, seq, f);
      const lru = simulate(ALGORITHMS.LRU, seq, f);
      const opt = simulate(ALGORITHMS.OPTIMAL, seq, f);

      assert.ok(
        opt.totalFaults <= fifo.totalFaults,
        `Optimal faults (${opt.totalFaults}) must be <= FIFO faults (${fifo.totalFaults}) for frames=${f}`
      );
      assert.ok(
        opt.totalFaults <= lru.totalFaults,
        `Optimal faults (${opt.totalFaults}) must be <= LRU faults (${lru.totalFaults}) for frames=${f}`
      );
    }
  }
});

test('Integration: Max frame boundary (10 frames) and 100-page sequence stress test', () => {
  // Generate pseudo-random sequence of 100 items
  const longSeq = [];
  for (let i = 0; i < 100; i++) {
    longSeq.push((i * 7 + 13) % 20);
  }

  const res = simulateOptimal(longSeq, 10);
  assert.equal(res.totalReferences, 100);
  assert.equal(res.totalHits + res.totalFaults, 100);
  assert.equal(res.steps.length, 100);
  assert.ok(res.totalReplacements <= res.totalFaults);
});

test('Integration: Pipeline from raw input string to simulation', () => {
  const rawInput = ' 7,  0, 1,  2, 0,  3, 0, 4, 2, 3, 0, 3, 2 ';
  const rawFrames = '3';

  const vSeq = validateReferenceString(rawInput);
  const vFrames = validateFrameCount(rawFrames);

  assert.equal(vSeq.isValid, true);
  assert.equal(vFrames.isValid, true);

  const res = simulate(ALGORITHMS.FIFO, vSeq.pages, vFrames.frameCount);
  assert.equal(res.totalFaults, 10);
  assert.equal(res.totalHits, 3);
  assert.equal(res.totalReplacements, 7);
});
