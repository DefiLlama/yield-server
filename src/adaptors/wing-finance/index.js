const superagent = require('superagent');
const { mapKeys, camelCase } = require('lodash');

const utils = require('../utils');

const API_URL = {
  ontology: 'https://flashapi.wing.finance/api/v1/userflashpooloverview',
  binance: 'https://ethapi.wing.finance/bsc/flash-pool/overview',
  ontologyEvm: 'https://ethapi.wing.finance/ontevm/flash-pool/overview',
  ethereum: 'https://ethapi.wing.finance/eth/flash-pool/overview',
};

const apy = async () => {
  const data = await Promise.all(
    Object.entries(API_URL).map(async ([chain, url]) => [
      chain,
      (await superagent.post(url).send({ address: '' })).body.result,
    ])
  );

  const normalizedData = data.map(([chain, data]) => [
    chain,
    chain === 'ontology'
      ? data.UserFlashPoolOverview.AllMarket
      : data.allMarket,
  ]);

  const pools = normalizedData.map(([chain, chainPools]) => {
    return chainPools
      .map((pool) => mapKeys(pool, (v, k) => camelCase(k)))
      .map((pool) => {
        return {
          pool: `${pool.name}-wing-finance-${chain}`,
          chain: chain === 'ontologyEvm' ? 'ontology' : chain,
          project: 'wing-finance',
          symbol: pool.name,
          tvlUsd:
            Number(pool.totalSupplyDollar) -
            Number(pool.totalValidBorrowDollar),
          apyBase: Number(pool.supplyApy) * 100,
          apyReward:
            (Number(pool.annualSupplyWingDistributedDollar) /
              Number(pool.totalSupplyDollar)) *
            100,
          rewardTokens: ['0xDb0f18081b505A7DE20B18ac41856BCB4Ba86A1a'],
          // borrow fields
          totalSupplyUsd: Number(pool.totalSupplyDollar),
          totalBorrowUsd: Number(pool.totalValidBorrowDollar),
          apyBaseBorrow: Number(pool.borrowApy) * 100,
          apyRewardBorrow:
            (Number(pool.annualBorrowWingDistributedDollar) /
              Number(pool.totalValidBorrowDollar)) *
            100,
          ltv: Number(pool.collateralFactor),
        };
      });
  });

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://flash.wing.finance/',
};
