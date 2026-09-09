const { test } = require('node:test');
const assert = require('node:assert/strict');
const { lendingAmounts } = require('./math');

const asset = {
  supplied: { balance: '100000000000000000000' },
  reserved: '20000000000000000000',
  prot_fee: '1000000000000000000',
  borrowed: { balance: '80000000000000000000' },
  margin_debt: { balance: '2000000000000000000' },
  margin_pending_debt: '1000000000000000000',
  config: { extra_decimals: 0 },
  supply_apr: '0.06',
};

function supplyOnlyAsset(balance) {
  return {
    supplied: { balance },
    reserved: '0',
    prot_fee: '0',
    borrowed: { balance: '0' },
    config: { extra_decimals: 0 },
    supply_apr: '0',
  };
}

test('lending accounts for reserves, protocol fees and margin debt', () => {
  assert.deepEqual(lendingAmounts(asset, 18, 1), {
    totalSupplyUsd: 121,
    totalBorrowUsd: 83,
    tvlUsd: 38,
    apyBase: 6,
  });
});

test('lending preserves precision when scaling before a large price', () => {
  assert.deepEqual(lendingAmounts(supplyOnlyAsset('1'), 24, '1e24'), {
    totalSupplyUsd: 1,
    totalBorrowUsd: 0,
    tvlUsd: 1,
    apyBase: 0,
  });
});

test('lending rejects unsafe numeric balances but accepts the exact decimal string', () => {
  const unsafeInteger = Number.MAX_SAFE_INTEGER + 1;

  assert.throws(() => lendingAmounts(supplyOnlyAsset(unsafeInteger), 16, 1));
  assert.equal(
    lendingAmounts(supplyOnlyAsset(String(unsafeInteger)), 16, 1)
      .totalSupplyUsd,
    0.9007199254740992
  );
});

test('lending rejects a nonzero result that underflows to zero', () => {
  assert.throws(() => lendingAmounts(supplyOnlyAsset('1'), 324, 1));
});

test('lending limits each precision and their sum to 36 decimals', () => {
  assert.equal(
    lendingAmounts(supplyOnlyAsset('1'), 36, '1e36').totalSupplyUsd,
    1
  );
  assert.equal(
    lendingAmounts(
      { ...supplyOnlyAsset('1'), config: { extra_decimals: 36 } },
      0,
      '1e36'
    ).totalSupplyUsd,
    1
  );
  assert.throws(() =>
    lendingAmounts(
      { ...supplyOnlyAsset('1'), config: { extra_decimals: 13 } },
      24,
      1
    )
  );
});

test('lending rejects pathological precision before BigNumber can underflow', () => {
  assert.throws(() =>
    lendingAmounts(
      {
        ...supplyOnlyAsset('1'),
        config: { extra_decimals: 9_999_976 },
      },
      24,
      '0.1'
    )
  );
});

test('lending requires a finite positive price', () => {
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
    assert.throws(
      () => lendingAmounts(asset, 18, value),
      `price ${String(value)}`
    );
  }
});

test('lending rejects malformed and negative raw balances', () => {
  const invalidRequiredBalance = (value) => [
    { ...asset, supplied: { balance: value } },
    { ...asset, reserved: value },
    { ...asset, prot_fee: value },
    { ...asset, borrowed: { balance: value } },
    { ...asset, margin_debt: { balance: value } },
    { ...asset, margin_pending_debt: value },
  ];

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
    for (const invalidAsset of invalidRequiredBalance(value)) {
      assert.throws(
        () => lendingAmounts(invalidAsset, 18, 1),
        `balance ${String(value)}`
      );
    }
  }
});

test('lending permits omitted optional margin balances as zero', () => {
  const withoutMargins = { ...asset };
  delete withoutMargins.margin_debt;
  delete withoutMargins.margin_pending_debt;

  assert.deepEqual(lendingAmounts(withoutMargins, 18, 1), {
    totalSupplyUsd: 121,
    totalBorrowUsd: 80,
    tvlUsd: 41,
    apyBase: 6,
  });
});

test('lending requires a finite non-negative APR', () => {
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
    assert.throws(
      () => lendingAmounts({ ...asset, supply_apr: value }, 18, 1),
      `APR ${String(value)}`
    );
  }
});

test('lending requires non-negative integer numeric precision', () => {
  const invalidPrecisions = [
    -1,
    1.5,
    '',
    '18',
    null,
    true,
    false,
    NaN,
    Infinity,
    37,
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const value of invalidPrecisions) {
    assert.throws(
      () => lendingAmounts(asset, value, 1),
      `decimals ${String(value)}`
    );
    assert.throws(
      () =>
        lendingAmounts({ ...asset, config: { extra_decimals: value } }, 18, 1),
      `extra decimals ${String(value)}`
    );
  }
});

test('lending rejects debt above accounted supply and numeric overflow', () => {
  assert.throws(() =>
    lendingAmounts(
      { ...asset, borrowed: { balance: '122000000000000000000' } },
      18,
      1
    )
  );
  assert.throws(() => lendingAmounts(asset, 18, '1e1000'));
});
