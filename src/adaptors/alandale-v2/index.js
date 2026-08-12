const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'alandale-v2';
const CHAIN = 'robinhood';
const URL = 'https://app.alandale.xyz';

const PAIR_FACTORY = '0xe0799417eff30A12249b8c30941BC2d7c52A0339';
const VOTER = '0x4cF1c47B95031cD2bb1d102021D8Ede60392971C';
const MINTER = '0x782355E7771A9Aa0834de4Ae981DCF3b7aeC11e6';
const LUTE = '0xD1e861CC5Eee7eA88649206b74504D78CCD7AEeA';

const SECONDS_PER_YEAR = 31536000;
const EPOCH = 604800;
const EPOCHS_PER_YEAR = 52;
const ZERO = '0x0000000000000000000000000000000000000000';

const multiCall = (abi, calls, target) =>
  sdk.api2.abi.multiCall({ abi, calls, target, chain: CHAIN, permitFailure: true });

const call = (target, abi) => sdk.api2.abi.call({ target, abi, chain: CHAIN });

const apy = async () => {
  const pairCount = Number(await call(PAIR_FACTORY, 'uint256:allPairsLength'));
  if (!pairCount) return [];

  const pairs = await multiCall(
    'function allPairs(uint256) view returns (address)',
    [...Array(pairCount).keys()],
    PAIR_FACTORY
  );

  const [token0s, token1s, stables, reserves, lpSupplies] = await Promise.all([
    multiCall('address:token0', pairs),
    multiCall('address:token1', pairs),
    multiCall('bool:stable', pairs),
    multiCall('function getReserves() view returns (uint256,uint256,uint256)', pairs),
    multiCall('erc20:totalSupply', pairs),
  ]);

  const tokens = [
    ...new Set([...token0s, ...token1s].filter(Boolean).map((a) => a.toLowerCase())),
  ];
  const [decimals, symbols] = await Promise.all([
    multiCall('erc20:decimals', tokens),
    multiCall('string:symbol', tokens),
  ]);
  const meta = {};
  tokens.forEach((a, i) => {
    meta[a] = { decimals: Number(decimals[i]), symbol: symbols[i] };
  });

  const gauges = await multiCall(
    'function poolToGauge(address) view returns (address)',
    pairs,
    VOTER
  );

  // Emissions are voted on per epoch, so each gauge's share of the weekly mint is
  // known from the vote weights before the epoch's distribution actually runs.
  const [activePeriod, weeklyRaw] = await Promise.all([
    call(MINTER, 'uint256:active_period'),
    call(MINTER, 'uint256:weekly'),
  ]);
  const epoch = BigInt(String(activePeriod)) - (BigInt(String(activePeriod)) % BigInt(EPOCH));
  const weeklyLute = Number(weeklyRaw) / 1e18;

  const [totalWeightRaw, poolWeights, rewardRates, gaugeSupplies] = await Promise.all([
    sdk.api2.abi.call({
      target: VOTER,
      abi: 'function totalWeightsPerEpoch(uint256) view returns (uint256)',
      params: [epoch.toString()],
      chain: CHAIN,
    }),
    multiCall(
      'function weightsPerEpoch(uint256, address) view returns (uint256)',
      pairs.map((pair) => ({ params: [epoch.toString(), pair] })),
      VOTER
    ),
    multiCall('uint256:rewardRate', gauges),
    multiCall('erc20:totalSupply', gauges),
  ]);
  const totalWeight = Number(totalWeightRaw) / 1e18;

  const { pricesByAddress } = await utils.getPrices([...tokens, LUTE], CHAIN);
  const lutePrice = pricesByAddress[LUTE.toLowerCase()] ?? 0;

  return pairs
    .map((pair, i) => {
      const address0 = (token0s[i] || '').toLowerCase();
      const address1 = (token1s[i] || '').toLowerCase();
      if (!meta[address0] || !meta[address1] || !reserves[i]) return null;

      const price0 = pricesByAddress[address0];
      const price1 = pricesByAddress[address1];
      if (price0 === undefined || price1 === undefined) return null;

      const reserve0 = Number(reserves[i][0]) / 10 ** meta[address0].decimals;
      const reserve1 = Number(reserves[i][1]) / 10 ** meta[address1].decimals;
      const tvlUsd = reserve0 * price0 + reserve1 * price1;
      if (!(tvlUsd > 0)) return null;

      // Only LP staked in the gauge earns emissions, so the reward APY is measured
      // against that share of the pair rather than the whole pool.
      const lpSupply = Number(lpSupplies[i]);
      const hasGauge = gauges[i] && gauges[i] !== ZERO;
      const stakedShare =
        hasGauge && gaugeSupplies[i] != null && lpSupply > 0
          ? Number(gaugeSupplies[i]) / lpSupply
          : 0;
      const stakedTvlUsd = tvlUsd * stakedShare;

      // Once an epoch is distributed the gauge carries a live rate; until then the
      // vote-weighted projection is what liquidity providers will actually receive.
      const liveLutePerYear = (Number(rewardRates[i] ?? 0) / 1e18) * SECONDS_PER_YEAR;
      const votedShare = totalWeight > 0 ? Number(poolWeights[i] ?? 0) / 1e18 / totalWeight : 0;
      const projectedLutePerYear = votedShare * weeklyLute * EPOCHS_PER_YEAR;
      const lutePerYear = liveLutePerYear > 0 ? liveLutePerYear : projectedLutePerYear;

      const apyReward =
        hasGauge && stakedTvlUsd > 0 && lutePerYear > 0 && lutePrice > 0
          ? ((lutePerYear * lutePrice) / stakedTvlUsd) * 100
          : 0;

      return {
        pool: `${pair}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${meta[address0].symbol}-${meta[address1].symbol}`,
        poolMeta: stables[i] ? 'Stable' : 'Volatile',
        tvlUsd,
        // Every pair routes its full swap fee to veLUTE voters, so liquidity
        // providers earn no trading fees and are compensated in LUTE emissions.
        apyBase: 0,
        apyReward: Number.isFinite(apyReward) ? apyReward : 0,
        underlyingTokens: [token0s[i], token1s[i]],
        rewardTokens: [LUTE],
        token: pair,
        url: `${URL}/pools/${pair}`,
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '8401',
  timetravel: false,
  apy,
  url: `${URL}/pools`,
};
