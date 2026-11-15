import test from 'node:test';
import assert from 'node:assert/strict';
import { validateReferenceString, validateFrameCount } from '../js/validation.js';

test('validateReferenceString: accepts standard comma/space sequences', () => {
  const result1 = validateReferenceString('7, 0, 1, 2, 0, 3');
  assert.equal(result1.isValid, true);
  assert.deepEqual(result1.pages, [7, 0, 1, 2, 0, 3]);

  const result2 = validateReferenceString('1 2 3 4');
  assert.equal(result2.isValid, true);
  assert.deepEqual(result2.pages, [1, 2, 3, 4]);

  const result3 = validateReferenceString('0,1,2,3');
  assert.equal(result3.isValid, true);
  assert.deepEqual(result3.pages, [0, 1, 2, 3]);
});

test('validateReferenceString: rejects empty or whitespace-only input', () => {
  const empty = validateReferenceString('');
  assert.equal(empty.isValid, false);
  assert.match(empty.error, /empty/i);

  const spaces = validateReferenceString('   \t\n  ');
  assert.equal(spaces.isValid, false);
  assert.match(spaces.error, /empty/i);
});

test('validateReferenceString: rejects consecutive and misplaced commas', () => {
  const consecutive1 = validateReferenceString('1,,2');
  assert.equal(consecutive1.isValid, false);
  assert.match(consecutive1.error, /consecutive/i);

  const consecutive2 = validateReferenceString('1, , 2');
  assert.equal(consecutive2.isValid, false);
  assert.match(consecutive2.error, /consecutive/i);

  const leading = validateReferenceString(',1, 2');
  assert.equal(leading.isValid, false);
  assert.match(leading.error, /leading or trailing/i);

  const trailing = validateReferenceString('1, 2,');
  assert.equal(trailing.isValid, false);
  assert.match(trailing.error, /leading or trailing/i);
});

test('validateReferenceString: rejects negative numbers and decimals', () => {
  const negative = validateReferenceString('7, -1, 2');
  assert.equal(negative.isValid, false);
  assert.match(negative.error, /negative/i);

  const decimal = validateReferenceString('7, 2.5, 3');
  assert.equal(decimal.isValid, false);
  assert.match(decimal.error, /decimal|integer/i);
});

test('validateReferenceString: rejects non-numeric tokens', () => {
  const letters = validateReferenceString('7, a, 3');
  assert.equal(letters.isValid, false);
  assert.match(letters.error, /only contain numbers/i);

  const special = validateReferenceString('7, 3#4, 1');
  assert.equal(special.isValid, false);
  assert.match(special.error, /only contain numbers/i);
});

test('validateFrameCount: accepts valid range (1 to 10)', () => {
  assert.equal(validateFrameCount(1).isValid, true);
  assert.equal(validateFrameCount(3).isValid, true);
  assert.equal(validateFrameCount(10).isValid, true);
  assert.equal(validateFrameCount('4').frameCount, 4);
});

test('validateFrameCount: rejects values outside range or non-integers', () => {
  assert.equal(validateFrameCount(0).isValid, false);
  assert.equal(validateFrameCount(11).isValid, false);
  assert.equal(validateFrameCount(-3).isValid, false);
  assert.equal(validateFrameCount(3.5).isValid, false);
  assert.equal(validateFrameCount('').isValid, false);
  assert.equal(validateFrameCount('abc').isValid, false);
});
