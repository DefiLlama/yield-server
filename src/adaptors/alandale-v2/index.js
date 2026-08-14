const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'alandale-v2';
const CHAIN = 'robinhood';
const URL = 'https://app.alandale.xyz';

const PAIR_FACTORY = '0xe0799417eff30A12249b8c30941BC2d7c52A0339';
const VOTER = '0x4cF1c47B95031cD2bb1d102021D8Ede60392971C';
const MINTER = '0x782355E7771A9Aa0834de4Ae981DCF3b7aeC11e6';
const LUTE = '0xD1e861CC5Eee7eA88649206b74504D78CCD7AEeA';

// Trailing zeros are trimmed, matching how fee tiers read elsewhere: 0.18%, 0.04%.
const formatFee = (rate) => `${Number((rate * 100).toFixed(3))}%`;

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

  // Swap fees are per pair and differ between the stable and volatile curves.
  const [feePrecisionRaw, pairFees] = await Promise.all([
    call(PAIR_FACTORY, 'uint256:PRECISION'),
    multiCall(
      'function getFee(address, bool) view returns (uint256)',
      pairs.map((pair, i) => ({ params: [pair, Boolean(stables[i])] })),
      PAIR_FACTORY
    ),
  ]);
  const feePrecision = Number(feePrecisionRaw) || 1;

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
  const [activePeriod, weeklyRaw, teamRateRaw, precisionRaw] = await Promise.all([
    call(MINTER, 'uint256:active_period'),
    call(MINTER, 'uint256:weekly'),
    call(MINTER, 'uint256:teamRate'),
    call(MINTER, 'uint256:PRECISION'),
  ]);
  const epoch = BigInt(String(activePeriod)) - (BigInt(String(activePeriod)) % BigInt(EPOCH));
  // The team takes its cut of the weekly mint before anything reaches a gauge.
  const precision = Number(precisionRaw) || 1;
  const weeklyLute = (Number(weeklyRaw) / 1e18) * (1 - Number(teamRateRaw) / precision);

  const readTotalWeight = (e) =>
    sdk.api2.abi.call({
      target: VOTER,
      abi: 'function totalWeightsPerEpoch(uint256) view returns (uint256)',
      params: [e.toString()],
      chain: CHAIN,
    });
  // A week's emissions are split on the votes of the epoch that funded it, which is
  // the one that just closed; the running epoch decides the week after.
  const [fundedRaw, runningRaw] = await Promise.all([
    readTotalWeight(epoch - BigInt(EPOCH)),
    readTotalWeight(epoch),
  ]);
  const funded = Number(fundedRaw) / 1e18;
  const voteEpoch = funded > 0 ? epoch - BigInt(EPOCH) : epoch;
  const totalWeight = funded > 0 ? funded : Number(runningRaw) / 1e18;

  const [poolWeights, rewardRates, periodFinishes, gaugeSupplies] = await Promise.all([
    multiCall(
      'function weightsPerEpoch(uint256, address) view returns (uint256)',
      pairs.map((pair) => ({ params: [voteEpoch.toString(), pair] })),
      VOTER
    ),
    multiCall('uint256:rewardRate', gauges),
    multiCall('uint256:periodFinish', gauges),
    multiCall('erc20:totalSupply', gauges),
  ]);
  const now = Math.floor(Date.now() / 1000);

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

      // An unavailable read must stay unavailable: collapsing it to 0 would publish a
      // verified no-reward pair, which downstream cannot tell apart from a real zero.
      const gauge = gauges[i];
      const lpSupply = Number(lpSupplies[i]);
      let apyReward = null;
      if (gauge == null) apyReward = null;
      else if (gauge === ZERO) apyReward = 0;
      else if (gaugeSupplies[i] == null || !(lpSupply > 0)) apyReward = null;
      else {
        // Only LP staked in the gauge earns emissions, so the reward APY is measured
        // against that share of the pair rather than the whole pool.
        const stakedTvlUsd = tvlUsd * (Number(gaugeSupplies[i]) / lpSupply);

        // Once an epoch is distributed the gauge carries a live rate; until then the
        // vote-weighted projection is what liquidity providers will actually receive.
        // The gauge leaves rewardRate set after its reward period ends, so a rate is
        // only live while periodFinish is still ahead of us.
        const rewardsActive =
          periodFinishes[i] != null && Number(periodFinishes[i]) > now;
        const liveLutePerYear =
          rewardsActive && rewardRates[i] != null
            ? (Number(rewardRates[i]) / 1e18) * SECONDS_PER_YEAR
            : 0;
        let lutePerYear = liveLutePerYear;
        if (!(lutePerYear > 0)) {
          if (poolWeights[i] == null) lutePerYear = null;
          else if (!(totalWeight > 0)) lutePerYear = 0;
          else
            lutePerYear =
              (Number(poolWeights[i]) / 1e18 / totalWeight) * weeklyLute * EPOCHS_PER_YEAR;
        }

        if (lutePerYear === 0) apyReward = 0;
        else if (lutePerYear > 0 && lutePrice > 0 && stakedTvlUsd > 0)
          apyReward = ((lutePerYear * lutePrice) / stakedTvlUsd) * 100;
      }

      return {
        pool: `${pair}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: `${meta[address0].symbol}-${meta[address1].symbol}`,
        poolMeta: `${stables[i] ? 'Stable' : 'Volatile'}${
          pairFees[i] == null ? '' : ` ${formatFee(Number(pairFees[i]) / feePrecision)}`
        }`,
        tvlUsd,
        // Every pair routes its full swap fee to veLUTE voters, so liquidity
        // providers earn no trading fees and are compensated in LUTE emissions.
        apyBase: 0,
        apyReward: Number.isFinite(apyReward) ? apyReward : null,
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
