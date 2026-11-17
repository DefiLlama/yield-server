const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { getPriceApiData } = require('../utils');

const chain = 'hyperliquid';
const stex = '0x39694eff3b02248929120c73f90347013aec834d';
const sthype = '0xffaa4a3d97fe9107cef8a3f48c069f577ff76cc1';
const whype = '0x5555555555555555555555555555555555555555';
const originalModule = '0x40ba056b004edd0b572509a1276fd8530cf2bb7f';
const deploymentBlock = 1937868;
const day = 86400;

const call = async (block, target, abi, params = [], skipCache = false) =>
  (await sdk.api.abi.call({ chain, block, target, abi, params, skipCache }))
    .output;

// Reconstruct net LP assets for both current and pre-lens historical snapshots.
async function readState(block) {
  const [pool, module, supply, paused] = await Promise.all([
    call(block, stex, 'address:pool'),
    // Withdrawal modules can migrate; the SDK's address cache is not block-aware.
    call(block, stex, 'address:withdrawalModule', [], true),
    call(block, stex, 'uint256:totalSupply'),
    call(block, stex, 'bool:paused'),
  ]);
  const [reserves, lending, unstaking, pending, claimable, native] =
    await Promise.all([
      call(
        block,
        pool,
        'function getReserves() view returns (uint256,uint256)'
      ),
      ...[
        'amountToken1LendingPool',
        'amountToken0PendingUnstaking',
        'amountToken1PendingLPWithdrawal',
        'amountToken1ClaimableLPWithdrawal',
      ].map((name) => call(block, module, `uint256:${name}`)),
      sdk.api.eth
        .getBalance({ chain, block, target: module })
        .then((result) => result.output),
    ]);
  const excess =
    BigInt(native) > BigInt(claimable)
      ? BigInt(native) - BigInt(claimable)
      : 0n;
  let surplus = 0n;
  if (excess > 0n) {
    const abi =
      module.toLowerCase() === originalModule
        ? 'uint256:_amountToken1PendingLPWithdrawal'
        : 'uint256:amountToken1PendingLPWithdrawalBeforeUpdate';
    const before = BigInt(await call(block, module, abi));
    surplus = excess > before ? excess - before : 0n;
  }
  const converted = BigInt(
    await call(
      block,
      module,
      'function convertToToken1(uint256) view returns (uint256)',
      [(BigInt(reserves[0]) + BigInt(unstaking)).toString()]
    )
  );
  const assets =
    BigInt(reserves[1]) +
    BigInt(lending) +
    converted +
    surplus -
    BigInt(pending);
  if (assets < 0n) throw new Error('Negative STEX NAV');
  return { assets, supply: BigInt(supply), paused };
}

function annualized(before, after, elapsed) {
  if (
    before.assets <= 0n ||
    before.supply <= 0n ||
    after.assets <= 0n ||
    after.supply <= 0n ||
    elapsed <= 0
  )
    throw new Error('Invalid STEX yield baseline');
  const change = new BigNumber((after.assets * before.supply).toString())
    .div((before.assets * after.supply).toString())
    .minus(1)
    .toNumber();
  const apy = Math.expm1((Math.log1p(change) * 31536000) / elapsed) * 100;
  if (!Number.isFinite(apy)) throw new Error('Invalid STEX APY');
  return apy;
}

const apy = async (timestamp) => {
  const now =
    timestamp === undefined
      ? Math.floor(Date.now() / 1000) - 60
      : Number(timestamp);
  if (!Number.isInteger(now) || now <= 7 * day)
    throw new Error('Invalid STEX timestamp');
  const [current, previous, week] = await Promise.all(
    [now, now - day, now - 7 * day].map((time) =>
      sdk.api.util.lookupBlock(time, { chain })
    )
  );
  if (previous.block < deploymentBlock)
    throw new Error('Insufficient STEX yield history');
  const [state, state1d, state7d, prices] = await Promise.all([
    readState(current.block),
    readState(previous.block),
    week.block >= deploymentBlock ? readState(week.block) : undefined,
    getPriceApiData(
      `/prices/historical/${current.timestamp}/${chain}:${whype}`
    ),
  ]);
  if (state.assets === 0n) return [];
  const price = prices.coins?.[`${chain}:${whype}`]?.price;
  if (!Number.isFinite(price) || price <= 0)
    throw new Error('Missing HYPE price');
  const tvlUsd = new BigNumber(state.assets.toString())
    .div('1e18')
    .times(price)
    .toNumber();
  if (!Number.isFinite(tvlUsd)) throw new Error('Invalid STEX TVL');
  return [
    {
      pool: `${stex}-${chain}`,
      chain: 'Hyperliquid L1',
      project: 'valantis-stex',
      symbol: 'stHYPE-HYPE',
      token: stex,
      underlyingTokens: [sthype, whype],
      tvlUsd,
      apyBase: annualized(
        state1d,
        state,
        current.timestamp - previous.timestamp
      ),
      ...(state7d && state7d.supply > 0n
        ? {
            apyBase7d: annualized(
              state7d,
              state,
              current.timestamp - week.timestamp
            ),
          }
        : {}),
      pricePerShare: new BigNumber(state.assets.toString())
        .div(state.supply.toString())
        .toNumber(),
      frozen: state.paused,
      poolMeta: state.paused ? 'Withdrawal-only' : 'STEX LP',
      url: 'https://app.valantis.xyz/vaults',
    },
  ];
};

module.exports = { protocolId: '5987', timetravel: true, apy };
