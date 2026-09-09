const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  value,
  rate,
  assertConservation,
  assertShareIdentity,
} = require('./math');

test('staking token amounts and virtual-price precision remain distinct', () => {
  assert.equal(value('2000000000000000000', 18, 0.02), 0.04);
  assert.equal(value('3000000000000000000000000', 24, 2.4), 7.2);
  assert.equal(value('111049773', 8, 1), 1.11049773);
  assert.throws(() => value('100', 18, undefined));
});

test('staking value scales before applying a large price', () => {
  assert.equal(value('1', 24, '1e24'), 1);
  assert.equal(value('0', 24, 2.4), 0);
});

test('staking value rejects lossy, malformed and unrepresentable inputs', () => {
  assert.throws(() => value(Number.MAX_SAFE_INTEGER + 1, 18, 1));
  assert.throws(() => value('-1', 18, 1));
  assert.throws(() => value('1', '18', 1));
  assert.throws(() => value('1', 37, 1));
  assert.throws(() => value('1', 324, 1));
  assert.throws(() => value('1e1000', 0, 1));
});

test('reward exhaustion uses current reserve and invalid data must fail', () => {
  assert.equal(rate('1', '31536000', '100'), 100);
  assert.equal(rate('1', '31536000', '1'), 100);
  assert.equal(rate('1', '31536000', '0'), 0);
  assert.equal(rate('0', '31536000', '100'), 0);
  assert.throws(() => rate('1', '0', '100'));
  assert.throws(() => rate('1', '10', undefined));
  assert.throws(() => rate(Number.MAX_SAFE_INTEGER + 1, '10', '1'));
  assert.throws(() => rate('1', '1e1000', '1'));
});

test('RHEA stored and projected balances conserve exact raw units', () => {
  assert.doesNotThrow(() => assertConservation('100', '20', '105', '15'));
  assert.throws(() => assertConservation('100', '20', '105', '14'));
  assert.throws(() => assertConservation('100', '-1', '99', '0'));
});

test('share identities use raw cross-products and precision-derived bounds', () => {
  assert.doesNotThrow(() => assertShareIdentity('11', '10', '100000000', 8));
  assert.doesNotThrow(() => assertShareIdentity('9', '10', '100000000', 8));
  assert.throws(() => assertShareIdentity('12', '10', '100000000', 8));

  assert.doesNotThrow(() =>
    assertShareIdentity(
      '159443806597391388037903414',
      '143576835905537025667498273',
      '111051205',
      8
    )
  );
  assert.doesNotThrow(() =>
    assertShareIdentity(
      '9066230401172319574764613674585',
      '8549222261239603647875270492201',
      '1060474289255143517268435',
      24
    )
  );
});

test('share identities require unsigned decimal strings and valid precision', () => {
  assert.throws(() => assertShareIdentity(10, '10', '100000000', 8));
  assert.throws(() => assertShareIdentity('10.5', '10', '100000000', 8));
  assert.throws(() => assertShareIdentity('10', '10', '100000000', 1.5));
});
