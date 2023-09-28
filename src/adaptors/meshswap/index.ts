const utils = require('../utils');

const API_URL: string = 'https://s.meshswap.fi/stat/recentPoolInfo.min.json';
const TOKENS_URL = 'https://s.meshswap.fi/stat/tokenInfo.min.json';
const LENDING_URL = 'https://s.meshswap.fi/stat/leverage.min.json';

const MESH_TOKEN = '0x82362Ec182Db3Cf7829014Bc61E9BE8a2E82868a';

const csvLikeToObjArr = <T>(csv: Array<any>): Array<T> => {
  const headers = csv[0];

  return csv
    .slice(1)
    .map((row) =>
      row.reduce((acc, val, i) => ({ ...acc, [headers[i]]: val }), {})
    );
};

interface Pool {
  exchange_address: string;
  poolVolume: string;
  totalRewardRate: string;
  feeRewardRate: string;
  token0: string;
  token1: string;
}

interface Token {
  address: string;
  symbol: string;
}
interface Lending {
  address: string;
  tokenSymbol: string;
  totalDepositVol: string;
  totalRewardRate: string;
  supplyRate: string;
  token: string;
}

const getApy = async () => {
  const { recentPool: farmsRes } = await utils.getData(API_URL);
  const tokensRes = await utils.getData(TOKENS_URL);
  const {
    leveragePool: { single: lendingRes },
  } = await utils.getData(LENDING_URL);

  const farms = csvLikeToObjArr<Pool>(farmsRes);
  const tokens = csvLikeToObjArr<Token>(tokensRes);
  const lending = csvLikeToObjArr<Lending>(lendingRes);
  tokens;

  const lendingPools = lending.map((market) => {
    return {
      pool: market.address,
      chain: utils.formatChain('polygon'),
      project: 'meshswap',
      symbol: market.tokenSymbol,
      tvlUsd: Number(market.totalDepositVol),
      apyBase: Number(market.supplyRate),
      apyReward: Number(market.totalRewardRate) - Number(market.supplyRate),
      underlyingTokens: [market.token],
      rewardTokens: [MESH_TOKEN, market.token],
    };
  });

  const pools = farms.map((farm) => {
    const token0 = tokens.find((token) => token.address === farm.token0);
    const token1 = tokens.find((token) => token.address === farm.token1);

    return {
      pool: farm.exchange_address,
      chain: utils.formatChain('polygon'),
      project: 'meshswap',
      symbol: `${token0.symbol}-${token1.symbol}`,
      tvlUsd: Number(farm.poolVolume),
      apyReward: Number(farm.totalRewardRate) - Number(farm.feeRewardRate),
      apyBase: Number(farm.feeRewardRate),
      underlyingTokens: [farm.token0, farm.token1],
      rewardTokens: [MESH_TOKEN],
      url: `https://meshswap.fi/exchange/pool/detail/${farm.exchange_address}`,
    };
  });

  const res = [...pools, ...lendingPools];

  return res;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://meshswap.fi/exchange/pool',
};
