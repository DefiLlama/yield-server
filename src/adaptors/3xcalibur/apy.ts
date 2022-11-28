const sdk = require('@defillama/sdk');
const BN = require('bignumber.js');
const utils = require('../utils');

const { getXCALPrice, getSwapPairs } = require('./subgraph');
const GAUGE_ABI = require('./abi.json');

const STABLE_FEE_PERCENTAGE = 0.00369;
const VARIABLE_FEE_PERCENTAGE = 0.27;

const CHAIN = 'arbitrum';

const XCAL_ADRESS = '0xd2568acCD10A4C98e87c44E9920360031ad89fCB';

const getApy = async () => {
  try {
    const [xcalPrice, pairs] = await Promise.all([
      getXCALPrice(),
      getSwapPairs(),
    ]);
    let gaugePairs: any = [];
    let nonGaugePairs: any = [];
    const multicalls: any[] = [];

    _uniquePairs(pairs).forEach((pair: any) => {
      if (pair.gaugeAddress) {
        gaugePairs.push(pair);

        // construct rewardRate multicall
        multicalls.push({ params: XCAL_ADRESS, target: pair.gaugeAddress });
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
      const apr = _calculateGaugeAPR(pair.reserveUSD, xcalPrice, rewardRate);
      const apy = _aprToApy(apr);
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
      const apy = _aprToApy(apr);
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
        chain: utils.formatChain('arbitrum'),
        project: '3xcalibur',
        symbol: `${token0.symbol}-${token1.symbol}`,
        tvlUsd: Number(reserveUSD),
        apyReward: apy,
        underlyingTokens: [token0.address, token1.address],
        rewardTokens: [XCAL_ADRESS],
        url: `https://app.3xcalibur.com/swap/liquidity/add?asset0=${token0.address}&asset1=${token1.address}&stable=${stable}`,
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
  xcalPrice: string
) => {
  const gaugeAPR = new BN(rewardRate)
    .div(1e18)
    .times(3600 * 24 * 365)
    .times(xcalPrice)
    .div(reserveUSD)
    .toFixed(18);

  return gaugeAPR;
};

const _aprToApy = (apr: string) => {
  const anualCompounds = 365; // assume 1 compound per day
  const leftSide = new BN(1).plus(new BN(apr).div(anualCompounds));
  return new BN(leftSide).pow(anualCompounds).minus(1).toFixed(18);
};

module.exports = {
  getApy,
};
