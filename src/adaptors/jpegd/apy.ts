const sdk = require('@defillama/sdk');
const BN = require('bignumber.js');

const abi = require('./abi');
require('dotenv').config({ path: './config.env' });

const APE_STAKING = '0x5954aB967Bc958940b7EB73ee84797Dc8a2AFbb9';
const APE_MATCHING = '0xD4b06218C545C047ac3ACc7cE49d124C172DB409';

async function getApeStakingAprs() {
  const [apePool, baycPool, maycPool, bakcPool] = (
    await sdk.api.abi.call({
      target: APE_STAKING,
      abi: abi.APE_STAKING_ABI.getPoolsUI,
      chain: 'ethereum',
    })
  ).output;

  const _apr = (pool: any) =>
    new BN(pool.currentTimeRange.rewardsPerHour.toString())
      .div(1e18)
      .times(24)
      .times(365)
      .div(new BN(pool.stakedAmount.toString()).div(1e18))
      .times(100)
      .toFixed();

  const aprs = {
    APE: _apr(apePool),
    BAYC: _apr(baycPool),
    MAYC: _apr(maycPool),
    BAKC: _apr(bakcPool),
  };

  return aprs;
}

async function getApecoinApy() {
  const [lastNonce, stakingAprs] = await Promise.all([
    sdk.api.abi.call({
      target: APE_MATCHING,
      abi: abi.APE_MATCHING_ABI.nextNonce,
      chain: 'ethereum',
    }),
    getApeStakingAprs(),
  ]);

  const offers = (
    await sdk.api.abi.multiCall({
      abi: abi.APE_MATCHING_ABI.offers,
      calls: new Array(Number(lastNonce.output))
        .fill(null)
        .map((_, i) => ({ target: APE_MATCHING, params: [i] })),
      chain: 'ethereum',
    })
  ).output;

  const { aprSum, count } = offers.reduce(
    (acc, offer, nonce) => {
      const { apeRewardShareBps, mainNft, offerType, apeAmount } = offer.output;
      const isBakcOffer = nonce % 2 === 1;
      const collection = isBakcOffer
        ? 'BAKC'
        : mainNft.collection === 0
        ? 'BAYC'
        : 'MAYC';
      const apeRewardShare = new BN(apeRewardShareBps.toString())
        .div(100)
        .toNumber();
      const mainPoolApr =
        collection === 'BAYC' ? stakingAprs.BAYC : stakingAprs.MAYC;
      const apeApr = new BN(isBakcOffer ? stakingAprs.BAKC : mainPoolApr)
        .times(apeRewardShare)
        .div(100)
        .toFixed();
      const isValidOffer =
        [1, 2].includes(Number(offerType)) &&
        new BN(apeAmount.toString()).gt(0);

      if (isValidOffer) {
        acc.count += 1;
        acc.aprSum = new BN(acc.aprSum).plus(apeApr).toFixed();
      }
      return acc;
    },
    { aprSum: '0', count: 0 }
  );
  const avgApr = new BN(aprSum).div(count).toFixed(2);
  const apy = toApy(avgApr);
  return apy;
}

function toApy(apr: string) {
  const formattedApr = Number(apr) / 100;
  const apy = Math.pow(1 + formattedApr / 365, 365) - 1;
  return apy * 100;
}

module.exports = {
  getApecoinApy,
};
