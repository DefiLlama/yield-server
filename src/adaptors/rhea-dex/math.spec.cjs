const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lpTvl, feeAnnualPercent } = require('./math');

test('LP value uses each token precision and price', () => {
  assert.equal(
    lpTvl(['1000000', '2000000000000000000'], [6, 18], [1, 0.99]),
    2.98
  );
});

test('LP value preserves precision when scaling before a large price', () => {
  assert.equal(lpTvl(['1'], [24], ['1e24']), 1);
});

test('LP value rejects unsafe numeric amounts but accepts the exact decimal string', () => {
  const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;

  assert.throws(() => lpTvl([unsafeInteger], [16], [1]));
  assert.equal(lpTvl([String(unsafeInteger)], [16], [1]), 0.9007199254740992);
});

test('LP value requires aligned non-empty arrays', () => {
  assert.throws(() => lpTvl([], [], []));
  assert.throws(() => lpTvl(['1'], [], [1]));
  assert.throws(() => lpTvl(['1'], [0], []));
  assert.throws(() => lpTvl('1', [0], [1]));
});

test('LP value rejects malformed and negative raw amounts', () => {
  for (const value of [
    '',
    '  ',
    null,
    true,
    false,
    NaN,
    Infinity,
    -Infinity,
    'NaN',
    'Infinity',
    -1,
    '-1',
  ]) {
    assert.throws(() => lpTvl([value], [0], [1]), `amount ${String(value)}`);
  }
});

test('LP value requires finite positive prices', () => {
  for (const value of [
    0,
    -1,
    '-1',
    '',
    '  ',
    null,
    true,
    false,
    NaN,
    Infinity,
    -Infinity,
    'NaN',
    'Infinity',
  ]) {
    assert.throws(() => lpTvl(['1'], [0], [value]), `price ${String(value)}`);
  }
});

test('LP value requires non-negative integer numeric precision', () => {
  for (const value of [
    -1,
    1.5,
    '',
    '6',
    null,
    true,
    false,
    NaN,
    Infinity,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    assert.throws(
      () => lpTvl(['1'], [value], [1]),
      `decimals ${String(value)}`
    );
  }
});

test('LP value must be positive and fit in a finite number', () => {
  assert.throws(() => lpTvl(['0'], [0], [1]));
  assert.throws(() => lpTvl(['1e1000'], [0], [1]));
  assert.throws(() => lpTvl(['1'], [324], [1]));
});

test('LP fees are annualized exactly once', () => {
  assert.equal(feeAnnualPercent(10, 1000), 365);
  assert.equal(feeAnnualPercent(0, 1000), 0);
  assert.equal(feeAnnualPercent('1', '1e22'), 3.65e-18);
});

test('LP fees reject unsafe numeric inputs but accept exact decimal strings', () => {
  const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;

  assert.throws(() => feeAnnualPercent(unsafeInteger, String(unsafeInteger)));
  assert.equal(
    feeAnnualPercent(String(unsafeInteger), String(unsafeInteger)),
    36500
  );
});

test('LP fees require a finite non-negative fee and finite positive TVL', () => {
  for (const value of [
    -1,
    '-1',
    '',
    '  ',
    null,
    true,
    false,
    NaN,
    Infinity,
    -Infinity,
    'NaN',
    'Infinity',
  ]) {
    assert.throws(() => feeAnnualPercent(value, 1000), `fee ${String(value)}`);
  }
  for (const value of [
    0,
    -1,
    '-1',
    '',
    '  ',
    null,
    true,
    false,
    NaN,
    Infinity,
    -Infinity,
    'NaN',
    'Infinity',
  ]) {
    assert.throws(() => feeAnnualPercent(10, value), `TVL ${String(value)}`);
  }
});

test('LP fee percentage must fit in a finite number', () => {
  assert.throws(() => feeAnnualPercent('1e1000', 1));
  assert.throws(() => feeAnnualPercent('1', '1e400'));
});
