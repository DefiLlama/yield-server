const utils = require('../utils');
const sdk = require('@defillama/sdk');

const API_URL = 'https://app.liqee.io/pos/markets?network=mainnet';

interface Staking {
  [addres: string]: number;
}

interface Market {
  address: string;
  underlying_symbol: string;
  supplyValue: string;
  borrowValue: string;
  decimals: string;
  supplyAPY: string;
  borrowAPY: string;
  rewardSupplyApy: string;
  rewardBorrowApy: string;
}

interface Underlying {
  underlying: string;
}

interface Markets {
  supplyMarkets: Array<Market>;
  underlyingToken: Array<Underlying>;
}

const apy = async () => {
  const data: Markets = await utils.getData(API_URL);

  const res = data.supplyMarkets.map((market, i) => {
    const apyReward =
      (Number(market.rewardSupplyApy) / 10 ** Number(market.decimals)) * 100;

    return {
      pool: market.address,
      chain: utils.formatChain('ethereum'),
      project: 'liqee',
      symbol: market.underlying_symbol,
      tvlUsd:
        (Number(market.supplyValue) - Number(market.borrowValue)) /
        10 ** Number(market.decimals),
      apyBase: (Number(market.supplyAPY) / 10 ** Number(market.decimals)) * 100,
      apyReward,
      rewardTokens: apyReward > 0 ? [market.address] : null,
      underlyingTokens:
        market.underlyingSymbol === 'ETH'
          ? ['0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2']
          : [data.underlyingToken[i].underlying],
      // borrow fields
      totalSupplyUsd:
        Number(market.supplyValue) / 10 ** Number(market.decimals),
      totalBorrowUsd:
        Number(market.borrowValue) / 10 ** Number(market.decimals),
      apyBaseBorrow:
        (Number(market.borrowAPY) / 10 ** Number(market.decimals)) * 100,
      apyRewardBorrow:
        (Number(market.rewardBorrowApy) / 10 ** Number(market.decimals)) * 100,
    };
  });

  return res;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.liqee.io/#/lending?AssetsType=Lend&currentPool=pos',
};
