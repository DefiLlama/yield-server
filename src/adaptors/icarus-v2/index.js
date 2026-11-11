const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'rise';
const FACTORY = '0xEe10C6a0f158bFEeef3d48Dc0D26130Cf6115615';
const POOLS = [
  '0x226C39A8b9db958E6065c2911c267c2e26A4514A', // WETH-USDC.e
];
const VOTER = '0xFB3773f03EFB35198b065e455090E55eE25D3177';
const DAY = 86400;
const ZERO = '0x0000000000000000000000000000000000000000';

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

const callEach = (abi, target, params) =>
  sdk.api.abi
    .multiCall({
      abi,
      chain: CHAIN,
      calls: params.map((p) => ({ target, params: p })),
      permitFailure: true,
    })
    .then((r) => r.output.map((o) => o.output));

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const block1d = (await sdk.blocks.getBlock(CHAIN, now - DAY)).block;

  const [
    token0s,
    token1s,
    stables,
    reserves,
    supplies,
    index0Now,
    index1Now,
    index0Prior,
    index1Prior,
    gauges,
  ] = await Promise.all([
    multiCall('address:token0', POOLS),
    multiCall('address:token1', POOLS),
    multiCall('bool:stable', POOLS),
    multiCall(
      'function getReserves() view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)',
      POOLS
    ),
    multiCall('uint256:totalSupply', POOLS),
    multiCall('uint256:index0', POOLS),
    multiCall('uint256:index1', POOLS),
    // fails for pools created within the last day; those get a null apyBase
    multiCall('uint256:index0', POOLS, block1d),
    multiCall('uint256:index1', POOLS, block1d),
    callEach(
      'function gauges(address) view returns (address)',
      VOTER,
      POOLS.map((p) => [p])
    ),
  ]);

  const fees = await callEach(
    'function getFee(address,bool) view returns (uint256)',
    FACTORY,
    POOLS.map((p, i) => [p, stables[i]])
  );

  const hasGauge = gauges.map((g) => g && g !== ZERO);
  const gaugeTargets = gauges.map((g, i) => (hasGauge[i] ? g : VOTER));
  const [alive, rewardRates, periodFinishes, rewardTokens, stakedSupplies] =
    await Promise.all([
      callEach(
        'function isAlive(address) view returns (bool)',
        VOTER,
        gaugeTargets.map((g) => [g])
      ),
      multiCall('uint256:rewardRate', gaugeTargets),
      multiCall('uint256:periodFinish', gaugeTargets),
      multiCall('address:rewardToken', gaugeTargets),
      multiCall('uint256:totalSupply', gaugeTargets),
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
    if (p0 === undefined || p1 === undefined || !reserves[i]) return null;
    const d0 = 10 ** meta[t0].decimals;
    const d1 = 10 ** meta[t1].decimals;

    const tvlUsd =
      (reserves[i]._reserve0 / d0) * p0 + (reserves[i]._reserve1 / d1) * p1;
    const supply = Number(supplies[i]);

    // index0/index1 accumulate fees per LP token (scaled by 1e18), so
    // their growth over a day times the LP supply is the day's swap fees.
    let apyBase = null;
    if (index0Prior[i] != null && index1Prior[i] != null && tvlUsd > 0) {
      const fees0 =
        (Number(BigInt(index0Now[i]) - BigInt(index0Prior[i])) / 1e18) *
        (supply / d0);
      const fees1 =
        (Number(BigInt(index1Now[i]) - BigInt(index1Prior[i])) / 1e18) *
        (supply / d1);
      apyBase = (((fees0 * p0 + fees1 * p1) * 365) / tvlUsd) * 100;
    }

    // emissions go only to LP tokens staked in the gauge
    let apyReward = 0;
    const rewardToken = rewardTokens[i]?.toLowerCase();
    const rewardPrice = hasGauge[i] && rewardToken && prices[rewardToken];
    const staked = Number(stakedSupplies[i] ?? 0);
    if (
      alive[i] &&
      Number(periodFinishes[i]) > now &&
      rewardPrice &&
      staked > 0 &&
      supply > 0
    ) {
      const stakedTvlUsd = (tvlUsd * staked) / supply;
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
      project: 'icarus-v2',
      symbol: utils.formatSymbol(`${meta[t0].symbol}-${meta[t1].symbol}`),
      poolMeta: `${stables[i] ? 'stable' : 'volatile'} - ${fees[i] / 100}%`,
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
  protocolId: '8472',
  timetravel: false,
  apy,
  url: 'https://www.icarus.finance',
};
