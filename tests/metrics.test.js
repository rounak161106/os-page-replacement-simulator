import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, ALGORITHMS } from '../js/algorithms.js';

test('Metric Invariant: Total References === Hits + Faults across all algorithms', () => {
  const sequences = [
    [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2],
    [1, 2, 3, 4, 1, 2, 5, 1, 2, 3, 4, 5],
    [0, 0, 0, 0, 0],
    [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
  ];

  const frameCounts = [1, 2, 3, 4, 5];

  for (const seq of sequences) {
    for (const fc of frameCounts) {
      for (const algo of [ALGORITHMS.FIFO, ALGORITHMS.LRU, ALGORITHMS.OPTIMAL]) {
        const result = simulate(algo, seq, fc);
        assert.equal(
          result.totalReferences,
          result.totalHits + result.totalFaults,
          `Invariant violation in ${algo}: References != Hits + Faults`
        );
        assert.ok(
          result.totalReplacements <= result.totalFaults,
          `Invariant violation in ${algo}: Replacements (${result.totalReplacements}) > Faults (${result.totalFaults})`
        );
        assert.equal(
          result.steps.length,
          seq.length,
          `Steps count must equal sequence length in ${algo}`
        );

        // Check each step's cumulative count consistency
        result.steps.forEach(step => {
          assert.equal(
            step.cumulativeHits + step.cumulativeFaults,
            step.stepNumber,
            `Step ${step.stepNumber} cumulative total must equal stepNumber`
          );
        });

        // Check ratio calculations
        assert.equal(
          Number((result.hitRatio + result.faultRatio).toFixed(6)),
          1.0,
          `Hit ratio + Fault ratio must equal 1.0 in ${algo}`
        );
      }
    }
  }
});

test('Performance metrics percentages calculate accurately', () => {
  const seq = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2];
  const res = simulate(ALGORITHMS.FIFO, seq, 3);

  const expectedHitPct = (3 / 13) * 100;
  const expectedFaultPct = (10 / 13) * 100;

  assert.equal(Number(res.hitPercentage.toFixed(4)), Number(expectedHitPct.toFixed(4)));
  assert.equal(Number(res.faultPercentage.toFixed(4)), Number(expectedFaultPct.toFixed(4)));
});
