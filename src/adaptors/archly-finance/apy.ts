const sdk = require('@defillama/sdk');
const BN = require('bignumber.js');
const utils = require('../utils');

const { getArcPrice, getSwapPairs } = require('./subgraph');
const GAUGE_ABI = require('./gauge_abi.json');

const STABLE_FEE_PERCENTAGE = 0.003;
const VARIABLE_FEE_PERCENTAGE = 0.003;

const CHAIN = 'telos';

const ARC_ADDRESS = '0xa84df7aFbcbCC1106834a5feD9453bd1219B1fb5';

const getApy = async () => {
  try {
    const [arcPrice, pairs] = await Promise.all([
      getArcPrice(),
      getSwapPairs(),
    ]);
    let gaugePairs: any = [];
    let nonGaugePairs: any = [];
    const multicalls: any[] = [];

    _uniquePairs(pairs).forEach((pair: any) => {
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
    gaugePairs = gaugePairs.map((pair: any, index: number) => {
      const rewardRate = gaugesRewardRates[index].toString();
      const apr = _calculateGaugeAPR(pair.reserveUSD, rewardRate, arcPrice);
      const apy = _toApy(apr);
      // apy might have 20+ decimals for low liq pool, just show apr instead
      pair.apy = new BN(apy).gt(1_000_000)
        ? Number(apr)
        : new BN(apy).times(100).toNumber();
      return pair;
    });
    // none-gauge pairs apr/apy
    nonGaugePairs = nonGaugePairs.map((pair: any) => {
      const apr = _calculateSwapFeeAPR(
        pair.volumeUSD,
        pair.reserveUSD,
        pair.stable
      );
      const apy = _toApy(apr);
      // apy might have 20+ decimals for low liq pool, just show apr instead
      pair.apy = new BN(apy).gt(1_000_000)
        ? Number(apr)
        : new BN(apy).times(100).toNumber();
      return pair;
    });

    return [...gaugePairs, ...nonGaugePairs]
      .sort((a: any, b: any) => Number(b.reserveUSD) - Number(a.reserveUSD))
      .map(({ address, token0, token1, reserveUSD, apy, stable }: any) => ({
        pool: address,
        chain: utils.formatChain('telos'),
        project: 'archly-finance',
        symbol: `${token0.symbol}-${token1.symbol}`,
        tvlUsd: Number(reserveUSD),
        apyReward: apy,
        underlyingTokens: [token0.address, token1.address],
        rewardTokens: [ARC_ADDRESS],
        url: `https://archly.fi/liquidity/${address}`,
      }));
  } catch (error) {
    console.error('error@getApy', error);
    return [];
  }
};

const _uniquePairs = (pairs: any[]) => {
  const existingPairs = new Set();
  return pairs
    .sort((a: any, b: any) => Number(b.reserveUSD) - Number(a.reserveUSD)) // keep the highest tvl pairs
    .filter((pair: any) => {
      const symbol = `${pair.token0.symbol}_${pair.token1.symbol}`;
      if (!existingPairs.has(symbol)) {
        existingPairs.add(symbol);
        return true;
      }
      return false;
    });
};

const _calculateSwapFeeAPR = (
  volumeUSD: string,
  reserveUSD: string,
  stable: boolean
) => {
  const feeShare = new BN(volumeUSD)
    .times(stable ? STABLE_FEE_PERCENTAGE : VARIABLE_FEE_PERCENTAGE)
    .div(100);
  const projectedYearlyFees = feeShare.times(365);
  const feeAPR = projectedYearlyFees.div(reserveUSD).times(100).toFixed();

  return feeAPR;
};

const _calculateGaugeAPR = (
  reserveUSD: string,
  rewardRate: string,
  arcPrice: string
) => {
  const gaugeAPR = new BN(rewardRate)
    .div(1e18)
    .times(3600 * 24 * 365)
    .times(arcPrice)
    .div(reserveUSD)
    .toFixed(18);

  return gaugeAPR;
};

const _toApy = (apr: string) => {
  const anualCompounds = 365; // assume 1 compound per day
  const leftSide = new BN(1).plus(new BN(apr).div(anualCompounds));
  return new BN(leftSide).pow(anualCompounds).minus(1).toFixed(18);
};

module.exports = {
  getApy,
};
