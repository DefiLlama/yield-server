const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'rise';
const POOLS = [
  '0xCBc0c0d2782f97077A6309e28B9B70Dc73a934D2', // USDR-USDC.e
  '0x6648031c9B95658113Db66c5f0548FE2FCEC43a8', // USDR-xlpUSD
  '0x8dD6C25986AfFd8CAa988bAbD7750b486F0D1aEb', // WETH-USDR
  '0x3A549019A200b3De6ce55Ab85Ee00124Df8e113e', // WBTC.e-USDR
];
const VOTER = '0xFB3773f03EFB35198b065e455090E55eE25D3177';
const DAY = 86400;
const Q128 = 2n ** 128n;
const U256 = 2n ** 256n;

const multiCall = (abi, targets, block) =>
  sdk.api.abi
    .multiCall({
      abi,
      chain: CHAIN,
      block,
      calls: targets.map((target) => ({ target })),
      permitFailure: true,
    })
    .then((r) => r.output.map((o) => o.output));

// fee growth per unit of liquidity over the last day; counters are uint256
// and allowed to overflow, so the difference is taken mod 2^256
const growth = (now, prior) =>
  now == null || prior == null
    ? null
    : (((BigInt(now) - BigInt(prior)) % U256) + U256) % U256;

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const block1d = (await sdk.blocks.getBlock(CHAIN, now - DAY)).block;

  const [
    token0s,
    token1s,
    fees,
    tickSpacings,
    liquidities,
    stakedLiquidities,
    gauges,
    fg0Now,
    fg1Now,
    fg0Prior,
    fg1Prior,
  ] = await Promise.all([
    multiCall('address:token0', POOLS),
    multiCall('address:token1', POOLS),
    multiCall('uint24:fee', POOLS),
    multiCall('int24:tickSpacing', POOLS),
    multiCall('uint128:liquidity', POOLS),
    multiCall('uint128:stakedLiquidity', POOLS),
    multiCall('address:gauge', POOLS),
    multiCall('uint256:feeGrowthGlobal0X128', POOLS),
    multiCall('uint256:feeGrowthGlobal1X128', POOLS),
    // fails for pools created within the last day; those get a null apyBase
    multiCall('uint256:feeGrowthGlobal0X128', POOLS, block1d),
    multiCall('uint256:feeGrowthGlobal1X128', POOLS, block1d),
  ]);

  const balances = (target, owners) =>
    sdk.api.abi
      .multiCall({
        abi: 'erc20:balanceOf',
        chain: CHAIN,
        calls: owners.map((owner, i) => ({
          target: target[i],
          params: [owner],
        })),
      })
      .then((r) => r.output.map((o) => o.output));
  const [balances0, balances1] = await Promise.all([
    balances(token0s, POOLS),
    balances(token1s, POOLS),
  ]);

  // Only gauges the voter still considers alive can emit. Some pools return a
  // gauge address that was never deployed, so every gauge read may fail.
  const alive = (
    await sdk.api.abi.multiCall({
      abi: 'function isAlive(address) view returns (bool)',
      chain: CHAIN,
      calls: gauges.map((g) => ({ target: VOTER, params: [g] })),
      permitFailure: true,
    })
  ).output.map((o) => o.output === true);
  const [rewardRates, periodFinishes, rewardTokens] = await Promise.all([
    multiCall('uint256:rewardRate', gauges),
    multiCall('uint256:periodFinish', gauges),
    multiCall('address:rewardToken', gauges),
  ]);

  const tokens = [
    ...new Set(
      [...token0s, ...token1s, ...rewardTokens]
        .filter(Boolean)
        .map((t) => t.toLowerCase())
    ),
  ];
  const [symbols, decimals, { pricesByAddress: prices }] = await Promise.all([
    multiCall('erc20:symbol', tokens),
    multiCall('erc20:decimals', tokens),
    utils.getPrices(tokens, CHAIN),
  ]);
  const meta = Object.fromEntries(
    tokens.map((t, i) => [t, { symbol: symbols[i], decimals: decimals[i] }])
  );

  return POOLS.map((pool, i) => {
    const t0 = token0s[i].toLowerCase();
    const t1 = token1s[i].toLowerCase();
    const p0 = prices[t0];
    const p1 = prices[t1];
    if (p0 === undefined || p1 === undefined) return null;
    const d0 = 10 ** meta[t0].decimals;
    const d1 = 10 ** meta[t1].decimals;

    const tvlUsd = (balances0[i] / d0) * p0 + (balances1[i] / d1) * p1;

    // Fees earned by the liquidity in range over the last day: fee growth
    // per unit of liquidity times the current in-range liquidity. Fee growth
    // is what an unstaked LP keeps, i.e. net of the pool's unstaked fee.
    const g0 = growth(fg0Now[i], fg0Prior[i]);
    const g1 = growth(fg1Now[i], fg1Prior[i]);
    let apyBase = null;
    if (g0 !== null && g1 !== null && tvlUsd > 0) {
      const liquidity = BigInt(liquidities[i]);
      const fees0 = Number((g0 * liquidity) / Q128) / d0;
      const fees1 = Number((g1 * liquidity) / Q128) / d1;
      apyBase = (((fees0 * p0 + fees1 * p1) * 365) / tvlUsd) * 100;
    }

    // Emissions go only to liquidity staked in the gauge. Staked TVL is
    // approximated by the staked share of in-range liquidity.
    let apyReward = 0;
    const rewardToken = rewardTokens[i]?.toLowerCase();
    const rewardPrice = rewardToken && prices[rewardToken];
    const staked = Number(stakedLiquidities[i] ?? 0);
    const liquidity = Number(liquidities[i]);
    if (
      alive[i] &&
      Number(periodFinishes[i]) > now &&
      rewardPrice &&
      staked > 0 &&
      tvlUsd > 0
    ) {
      const stakedTvlUsd = (tvlUsd * staked) / liquidity;
      const yearlyRewardUsd =
        (rewardRates[i] / 10 ** meta[rewardToken].decimals) *
        rewardPrice *
        365 *
        DAY;
      apyReward = (yearlyRewardUsd / stakedTvlUsd) * 100;
    }

    return {
      pool: `${pool}-${CHAIN}`.toLowerCase(),
      chain: 'RISE',
      project: 'icarus-cl',
      symbol: utils.formatSymbol(`${meta[t0].symbol}-${meta[t1].symbol}`),
      poolMeta: `CL${tickSpacings[i]} - ${fees[i] / 10000}%`,
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: apyReward > 0 ? [rewardToken] : [],
      underlyingTokens: [t0, t1],
      url: `https://www.icarus.finance/deposit?pool=${pool}`,
    };
  }).filter(Boolean);
};

module.exports = {
  protocolId: '8471',
  timetravel: false,
  apy,
  url: 'https://www.icarus.finance',
};
