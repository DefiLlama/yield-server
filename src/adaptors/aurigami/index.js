const differenceInWeeks = require('date-fns/differenceInWeeks');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const utils = require('../utils');
const abi = require('./abi');

const url = 'https://api.aurigami.finance/apys';

const WETH = '0xC9BdeEd33CD01541e1eeD10f90519d2C06Fe3feB';

const START_DATE = new Date(2022, 07, 12);
const END_DATE = new Date(2023, 03, 5);

const START_ALLOC = 0.33;
const NEXT_ALLOC = 0.66;

const apy = async () => {
  // PLY rewards unlock on a weekly basis by ~2pct
  // https://docs.aurigami.finance/public/protocol/liquidity-mining
  // we calc the rewardRatio to scale the values properly
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
  const [underlyingRes, totalBorrowsRes, getCashRes] = await Promise.all(
    ['underlying', 'totalBorrows', 'getCash'].map((method) =>
      sdk.api.abi.multiCall({
        abi: abi.find((n) => n.name === method),
        chain: 'aurora',
        calls: data.map((m) => ({ target: m.market, params: null })),
      })
    )
  );

  const underlyingData = underlyingRes.output.map((o) => o.output);
  const totalBorrowsData = totalBorrowsRes.output.map((o) => o.output);
  const cashData = getCashRes.output.map((o) => o.output);

  const gasTokenIndex = underlyingData.indexOf(null);
  underlyingData[gasTokenIndex] = WETH;

  const decimalsRes = await sdk.api.abi.multiCall({
    abi: 'erc20:decimals',
    chain: 'aurora',
    calls: underlyingData.map((u) => ({ target: u })),
  });
  const decimalsData = decimalsRes.output.map((o) => o.output);
  decimalsData[gasTokenIndex] = '18';

  const priceKeys = underlyingData.map((a) => `aurora:${a}`).join(',');
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).body.coins;

  const pools = data.map((d, i) => {
    const totalBorrowUsd =
      (totalBorrowsData[i] / 10 ** decimalsData[i]) *
      prices[`aurora:${underlyingData[i]}`]?.price;
    const tvlUsd =
      (cashData[i] / 10 ** decimalsData[i]) *
      prices[`aurora:${underlyingData[i]}`]?.price;
    const totalSupplyUsd = tvlUsd + totalBorrowUsd;

    return {
      pool: d.market,
      chain: 'Aurora',
      project: 'aurigami',
      symbol: d.symbol,
      tvlUsd: tvlUsd,
      apyBase: isNaN(100 * d.deposit.apyBase) ? 0 : 100 * d.deposit.apyBase,
      apyReward: isNaN(100 * d.deposit.apyReward)
        ? null
        : 100 * d.deposit.apyReward * currentRewardRatio,
      rewardTokens: d.deposit.rewardTokens,
      underlyingTokens: [underlyingData[i]],
      // borrow fields
      totalSupplyUsd,
      totalBorrowUsd,
      apyBaseBorrow:
        d?.borrow === undefined
          ? null
          : isNaN(100 * d.borrow.apyBase)
          ? null
          : 100 * d.borrow.apyBase,
      apyRewardBorrow:
        d?.borrow === undefined
          ? null
          : isNaN(100 * d.borrow.apyReward)
          ? null
          : 100 * d.borrow.apyReward * currentRewardRatio,
    };
  });

  return pools.map((p) => ({
    ...p,
    apyRewardBorrow:
      p.apyRewardBorrow < 0 ? -1 * p.apyRewardBorrow : p.apyRewardBorrow,
  }));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.aurigami.finance/',
};
