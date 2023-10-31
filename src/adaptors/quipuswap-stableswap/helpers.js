const axios = require('axios');
const utils = require('../utils');

const getFarms = async (projectName, filter) => {
  const { data: pools } = await axios.get(
    'https://staking-api-mainnet.prod.quipuswap.com/v3/all-farms'
  );

  return pools.list.filter(filter).map(({ item: pool }) => {
    const { underlyingTokens, symbol } = pool.tokens.reduce(
      (acc, token) => {
        acc['underlyingTokens'].push(token.contractAddress);
        acc['symbol'].push(token.metadata.symbol);
        return acc;
      },
      { underlyingTokens: [], symbol: [] }
    );
    return {
      pool: pool.contractAddress,
      chain: utils.formatChain('Tezos'),
      project: projectName,
      symbol: symbol.join('-'),
      tvlUsd: parseFloat(pool.tvlInUsd),
      apy: pool.apy,
      rewardTokens: [pool.rewardToken.contractAddress],
      underlyingTokens,
      url: `https://quipuswap.com/farming/${pool.version}/${pool.id}`,
    };
  });
};

module.exports = { getFarms };
