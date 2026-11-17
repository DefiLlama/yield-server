const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { getPriceApiData } = require('../utils');

const chain = 'hyperliquid';
const escrow = '0x0447d0339c82a8efe01994b7d1981bf5c517da0e';
const sthype = '0xffaa4a3d97fe9107cef8a3f48c069f577ff76cc1';
const whype = '0x5555555555555555555555555555555555555555';
const seed = '0x0000000000000000000000000000000000000001';
const deploymentBlock = 47206861;
const rawShares = '1000000000000000000000000';
const day = 86400;

const call = async (block, target, abi, params = []) =>
  (await sdk.api.abi.call({ chain, block, target, abi, params })).output;

// Active-user TVL excludes pending withdrawals, seed entitlement and reward reserves.
async function readState(block) {
  const [accounting, seedAccount, custody, rate, config, paused] =
    await Promise.all([
      call(
        block,
        escrow,
        'function totalAccounting() view returns (uint256,uint256,uint256,uint256)'
      ),
      call(
        block,
        escrow,
        'function account(address) view returns (uint256,uint256,uint256)',
        [seed]
      ),
      call(block, sthype, 'function sharesOf(address) view returns (uint256)', [
        escrow,
      ]),
      call(
        block,
        sthype,
        'function sharesToBalance(uint256) view returns (uint256)',
        [rawShares]
      ),
      call(
        block,
        escrow,
        'function configuration() view returns (address,address,address,uint64,uint64)'
      ),
      call(block, escrow, 'bool:paused'),
    ]);
  const [active, units, pending, rewards] = Array.from(accounting, BigInt);
  const seedUnits = BigInt(seedAccount[0]);
  if (seedUnits > units || (units === 0n && active !== 0n))
    throw new Error('Invalid escrow ownership');
  // The accounting view allocates recognized donations; excess custody is not added again.
  if (BigInt(custody) < active + pending + rewards)
    throw new Error('Escrow custody does not reconcile');
  const seedShares = units === 0n ? 0n : (active * seedUnits) / units;
  const userShares = active - seedShares;
  const assets = BigInt(
    await call(
      block,
      sthype,
      'function sharesToBalance(uint256) view returns (uint256)',
      [userShares.toString()]
    )
  );
  // Released premiums increase shares per ownership unit; stHYPE rebases increase their HYPE value.
  return {
    assets,
    numerator: active * BigInt(rate),
    denominator: units,
    hasUsers: userShares > 0n,
    cooldown: Number(config[3]),
    paused,
  };
}

function annualized(before, after, elapsed) {
  if (
    !before.hasUsers ||
    !after.hasUsers ||
    before.numerator <= 0n ||
    before.denominator <= 0n ||
    after.numerator <= 0n ||
    after.denominator <= 0n ||
    elapsed <= 0
  )
    throw new Error('Invalid restaking yield baseline');
  const change = new BigNumber(
    (after.numerator * before.denominator).toString()
  )
    .div((before.numerator * after.denominator).toString())
    .minus(1)
    .toNumber();
  const apy = Math.expm1((Math.log1p(change) * 31536000) / elapsed) * 100;
  if (!Number.isFinite(apy)) throw new Error('Invalid restaking APY');
  return apy;
}

const apy = async (timestamp) => {
  const now =
    timestamp === undefined
      ? Math.floor(Date.now() / 1000) - 60
      : Number(timestamp);
  if (!Number.isInteger(now) || now <= 7 * day)
    throw new Error('Invalid restaking timestamp');
  const [current, previous, week] = await Promise.all(
    [now, now - day, now - 7 * day].map((time) =>
      sdk.api.util.lookupBlock(time, { chain })
    )
  );
  if (previous.block < deploymentBlock)
    throw new Error('Insufficient restaking yield history');
  const [state, state1d, state7d, prices] = await Promise.all([
    readState(current.block),
    readState(previous.block),
    week.block >= deploymentBlock ? readState(week.block) : undefined,
    getPriceApiData(
      `/prices/historical/${current.timestamp}/${chain}:${whype}`
    ),
  ]);
  if (!state.hasUsers) return [];
  const price = prices.coins?.[`${chain}:${whype}`]?.price;
  if (!Number.isFinite(price) || price <= 0)
    throw new Error('Missing HYPE price');
  const tvlUsd = new BigNumber(state.assets.toString())
    .div('1e18')
    .times(price)
    .toNumber();
  if (!Number.isFinite(tvlUsd)) throw new Error('Invalid restaking TVL');
  return [
    {
      pool: `${escrow}-${chain}`,
      chain: 'Hyperliquid L1',
      project: 'valantis-sthype-restaking',
      symbol: 'stHYPE',
      token: null,
      underlyingTokens: [sthype],
      tvlUsd,
      // Base staking yield and released premiums are included once, not repeated as rewards.
      apyBase: annualized(
        state1d,
        state,
        current.timestamp - previous.timestamp
      ),
      ...(state7d?.hasUsers
        ? {
            apyBase7d: annualized(
              state7d,
              state,
              current.timestamp - week.timestamp
            ),
          }
        : {}),
      poolMeta: `${state.cooldown / day}-day cooldown${
        state.paused ? '; paused' : ''
      }`,
      url: 'https://app.valantis.xyz/restaking',
    },
  ];
};

module.exports = { protocolId: '9281', timetravel: true, apy };
