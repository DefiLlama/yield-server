const axios = require('axios');
const utils = require('../utils');

const poolsFunction = async () => {
  const { data: pools } = await axios.get(
    'https://staking-api-mainnet.prod.quipuswap.com/v3/all-farms'
  );

  return pools.list
    .filter(
      ({ item: pool }) =>
        pool.stakeStatus === 'ACTIVE' && parseFloat(pool.tvlInUsd) > 10e3
    )
    .map(({ item: pool }) => {
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
        project: 'quipuswap',
        symbol: symbol.join('-'),
        tvlUsd: parseFloat(pool.tvlInUsd),
        apy: pool.apy,
        rewardTokens: [pool.rewardToken.contractAddress],
        underlyingTokens,
        url: `https://quipuswap.com/farming/${pool.version}/${pool.id}`,
      };
    });
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
