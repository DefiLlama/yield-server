const utils = require('../utils');
const sdk = require('@defillama/sdk');

const API_URL = 'https://app.liqee.io/pos/markets?network=mainnet';
const STAKING_URL = 'https://app.liqee.io/liqee/rtoken?network=mainnet';

interface Staking {
  [addres: string]: number;
}

interface Market {
  address: string;
  underlying_symbol: string;
  supplyValue: string;
  decimals: string;
  supplyAPY: string;
}

interface Markets {
  supplyMarkets: Array<Market>;
}

const apy = async () => {
  const data: Markets = await utils.getData(API_URL);
  const stakingData: Staking = await utils.getData(STAKING_URL);

  const res = data.supplyMarkets.map((market) => {
    const stakingApy = (stakingData[market.address] / 1e18) * 100 || 0;
    return {
      pool: market.address,
      chain: utils.formatChain('ethereum'),
      project: 'liqee',
      symbol: market.underlying_symbol,
      tvlUsd: Number(market.supplyValue) / 10 ** Number(market.decimals),
      apyReward:
        (Number(market.supplyAPY) / 10 ** Number(market.decimals)) * 100 +
        stakingApy,
      rewardTokens: [market.address],
      underlyingTokens: [market.address],
    };
  });

  return res;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.liqee.io/#/lending?AssetsType=Lend&currentPool=pos',
};
