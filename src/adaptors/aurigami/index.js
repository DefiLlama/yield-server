const differenceInWeeks = require('date-fns/differenceInWeeks');

const utils = require('../utils');
const sdk = require('@defillama/sdk');
const url = 'https://api.aurigami.finance/apys';
const abi = {
  inputs: [],
  name: 'underlying',
  outputs: [{ internalType: 'address', name: '', type: 'address' }],
  stateMutability: 'view',
  type: 'function',
};
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const START_DATE = new Date(2022, 07, 12);
const END_DATE = new Date(2023, 03, 5);

const START_ALLOC = 0.33;
const NEXT_ALLOC = 0.66;

async function fetchUnderlyings(markets) {
  let underlyings = (
    await sdk.api.abi.multiCall({
      abi,
      calls: markets.map((d) => ({ target: d })),
      chain: 'aurora',
    })
  ).output.map((r) => r.output);

  const gasTokenIndex = underlyings.indexOf(null);
  underlyings[gasTokenIndex] = WETH;
  return underlyings;
}

const apy = async () => {
  const weeksToFullUnlock = differenceInWeeks(END_DATE, START_DATE);
  const currentWeeeksToUnlock = differenceInWeeks(END_DATE, new Date());
  let currentRewardRatio =
    START_ALLOC +
    (NEXT_ALLOC * (weeksToFullUnlock - currentWeeeksToUnlock)) /
      weeksToFullUnlock;
  if (currentRewardRatio > 1) {
    currentRewardRatio = 0;
  }
  const data = await utils.getData(url);
  const underlyings = await fetchUnderlyings(data.map((d) => d.market));
  return data.map((d, i) => ({
    pool: d.market,
    chain: 'Aurora',
    project: 'aurigami',
    symbol: d.symbol,
    tvlUsd: d.tvl,
    apyBase: isNaN(100 * d.deposit.apyBase) ? 0 : 100 * d.deposit.apyBase,
    apyReward: isNaN(100 * d.deposit.apyReward)
      ? 0
      : 100 * d.deposit.apyReward * currentRewardRatio,
    rewardTokens: d.deposit.rewardTokens,
    underlyingTokens: [underlyings[i]],
  }));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.aurigami.finance/',
};
