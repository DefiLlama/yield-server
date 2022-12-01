const superagent = require('superagent');
const utils = require('../utils');
const { tokens } = require('./constants');

const buildPool = (token, liquidityPool) => {
  return {
    pool: token.address,
    chain: utils.formatChain('ethereum'), // All yield on Mainnet
    project: 'across',
    symbol: utils.formatSymbol(token.symbol),
    tvlUsd:
      (token.price * Number(liquidityPool.totalPoolSize)) /
      10 ** token.decimals,
    apyBase: Number(liquidityPool.estimatedApy) * 100,
    underlyingTokens: [token.address],
  };
};

const queryLiquidityPool = async (l1TokenAddr) => {
  return await utils.getData(
    `https://across.to/api/pools?token=${l1TokenAddr}`
  );
};

const queryLiquidityPools = async (l1TokenAddrs) => {
  const pools = await Promise.all(
    l1TokenAddrs.map((l1TokenAddr) => queryLiquidityPool(l1TokenAddr))
  );
  return Object.fromEntries(
    pools.map((pool) => {
      return [pool.l1Token.toLowerCase(), pool];
    })
  );
};

const l1TokenPrices = async (l1TokenAddrs) => {
  const l1TokenQuery = l1TokenAddrs.map((addr) => `ethereum:${addr}`).join();
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${l1TokenQuery}`
  );

  return Object.fromEntries(
    l1TokenAddrs.map((addr) => {
      const { decimals, price } = data.coins[`ethereum:${addr}`];
      return [addr.toLowerCase(), { price, decimals }];
    })
  );
};

const main = async () => {
  const tokenAddrs = Object.values(tokens).map((token) => token.address);

  const [liquidityPools, tokenPrices] = await Promise.all([
    queryLiquidityPools(tokenAddrs),
    l1TokenPrices(tokenAddrs),
  ]);

  return Object.entries(tokens).map(([symbol, token]) => {
    const { address } = token;
    return buildPool(
      {
        address,
        symbol,
        decimals: tokenPrices[address].decimals,
        price: tokenPrices[address].price,
      },
      liquidityPools[address]
    );
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://across.to/pool',
};
