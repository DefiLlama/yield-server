const sdk = require('@defillama/sdk');
const BN = require('bignumber.js');
const utils = require('../utils');

const { getArcPrice, getPairs } = require('./subgraph');
const GAUGE_ABI = require('./gauge_abi.json');

const STABLE_FEE_PERCENTAGE = 0.005;
const VARIABLE_FEE_PERCENTAGE = 0.005;

const CHAIN = 'telos';

const ARC_ADDRESS = '0xa84df7afbcbcc1106834a5fed9453bd1219b1fb5';

const getApy = async () => {
  try {
    const [arcPrice, pairs] = await Promise.all([getArcPrice(), getPairs()]);
    let gaugePairs = [];
    let nonGaugePairs = [];
    const multicalls = [];

    _uniquePairs(pairs).forEach((pair) => {
      if (pair.gaugeAddress) {
        gaugePairs.push(pair);

        // construct rewardRate multicall
        multicalls.push({ params: ARC_ADDRESS, target: pair.gaugeAddress });
      } else {
        nonGaugePairs.push(pair);
      }
    });

    const gaugesRewardRates = (
      await sdk.api.abi.multiCall({
        calls: multicalls,

        abi: GAUGE_ABI.find(({ name }) => name === 'rewardRate'),
        chain: CHAIN,
      })
    ).output.map(({ output }) => output);

    // gauge pairs apr/apy
    gaugePairs = gaugePairs.map((pair, index) => {
      const rewardRate = gaugesRewardRates[index]?.toString();
      const aprReward = _calculateGaugeAPR(
        pair.reserveUSD,
        rewardRate,
        arcPrice
      );
      const aprFee = _calculateSwapFeeAPR(
        pair.volumeUSD,
        pair.reserveUSD,
        pair.stable
      );

      pair.apyBase = Number(aprFee);
      pair.apyReward = Number(aprReward);
      return pair;
    });
    // none-gauge pairs apr/apy
    nonGaugePairs = nonGaugePairs.map((pair) => {
      const aprFee = _calculateSwapFeeAPR(
        pair.volumeUSD,
        pair.reserveUSD,
        pair.stable
      );

      pair.apyBase = Number(aprFee);
      pair.apyReward = Number(0);
      return pair;
    });

    return [...gaugePairs, ...nonGaugePairs]
      .sort((a, b) => Number(b.reserveUSD) - Number(a.reserveUSD))
      .map(({ address, token0, token1, reserveUSD, apyReward }) => ({
        pool: address,
        chain: utils.formatChain('telos'),
        project: 'archly-v1',
        symbol: `${token0.symbol}-${token1.symbol}`.toUpperCase(),
        tvlUsd: Number(reserveUSD),
        apyReward: apyReward,
        underlyingTokens: [token0.address, token1.address],
        rewardTokens: [ARC_ADDRESS],
        url: `https://archly.fi/liquidity/${address}`,
      }))
      .filter((i) => utils.keepFinite(i));
  } catch (error) {
    console.error('error@getApy', error);
    return [];
  }
};

const _uniquePairs = (pairs) => {
  const existingPairs = new Set();
  return pairs
    .sort((a, b) => Number(b.reserveUSD) - Number(a.reserveUSD)) // keep the highest tvl pairs
    .filter((pair) => {
      const symbol = `${pair.token0.symbol}_${pair.token1.symbol}`;
      if (!existingPairs.has(symbol)) {
        existingPairs.add(symbol);
        return true;
      }
      return false;
    });
};

const _calculateSwapFeeAPR = (volumeUSD, reserveUSD, stable) => {
  const feeShare = new BN(volumeUSD)
    .times(stable ? STABLE_FEE_PERCENTAGE : VARIABLE_FEE_PERCENTAGE)
    .div(100);
  const projectedYearlyFees = feeShare.times(365);
  const feeAPR = projectedYearlyFees.div(reserveUSD).times(100).toFixed();

  return feeAPR;
};

const _calculateGaugeAPR = (reserveUSD, rewardRate, arcPrice) => {
  const gaugeAPR = new BN(rewardRate)
    .div(1e18)
    .times(3600 * 24 * 365)
    .times(arcPrice)
    .div(reserveUSD)
    .times(100)
    .toFixed(18);

  return gaugeAPR;
};

module.exports = {
  getApy,
};
