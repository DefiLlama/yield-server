const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const KGL_API_BASE_URL = 'https://api.kagla.finance/api/kagla/';

const getPools = async () => {
  const { pools } = await utils.getData(KGL_API_BASE_URL + 'pools');

  return pools;
};

const getMarkets = async () => {
  const {
    market: { pools: market },
  } = await utils.getData(KGL_API_BASE_URL + 'market/overview');
  return market;
};

const getPoolsData = async () => {
  const pools = await getPools();
  const market = await getMarkets();

  return pools.map((pool) => {
    const poolMarket = market.find((item) => item.address == pool.address);
    return {
      ...pool,
      gauges: poolMarket?.gauges || [],
    };
  });
};

const getAssetPrice = async () => {
  const assets = {
    ASTR: 'astar:0xecc867de9f5090f55908aaa1352950b9eed390cd',
    LAY: 'astar:0xc4335b1b76fa6d52877b3046eca68f6e708a27dd',
    KGL: 'astar:0x257f1a047948f73158dadd03eb84b34498bcdc60',
  };
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${Object.entries(assets)}`
  );

  return {
    0: 1,
    5: prices[assets.ASTR]?.price,
    6: prices[assets.KGL]?.price,
    7: prices[assets.LAY]?.price,
  };
};

const convertAPR2APY = (apr) => {
  return (apy = Math.pow(apr / 12 + 1, 12) - 1);
};

const getApy = async () => {
  const chain = 'astar';
  const poolsData = await getPoolsData();
  const prices = await getAssetPrice();

  return poolsData
    .map((pool) => {
      const {
        assetType,
        underlyingCoins,
        lpToken: { totalSupply, virtualPrice, address: lpAddress },
        gauges: [gauge],
      } = pool;
      const decimals = 18;
      let tvlUsd =
        (totalSupply * virtualPrice * prices[assetType]) /
        (10 ** decimals) ** 2;

      const apy = convertAPR2APY(gauge?.minAPR) * 100;
      return {
        pool: pool.address,
        chain: chain,
        project: 'kagla-finance',
        symbol: pool.name,
        tvlUsd: tvlUsd,
        apyReward: apy,
        underlyingTokens: underlyingCoins.map((coin) => coin.address),
        rewardTokens: [lpAddress],
        url: `https://kagla.finance/app/pools/${pool.address}`,
      };
    })
    .sort((pool) => pool.tvlUsd > 0)
    .filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
