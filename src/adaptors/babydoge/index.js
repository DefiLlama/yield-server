const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://graph-bsc-mainnet.babydoge.com/subgraphs/name/babydoge/faas';

const query = gql`
  {
    farms(first: 1000, block: {number: <PLACEHOLDER>}) {
      id
      APR
      totalStakedUsdValue
      rewardToken {
        id
        symbol
      }
      stakeToken {
        id
        isLpToken
        symbol
        token0 {
          id
          symbol
        }
        token1 {
          id
          symbol
        }
      }
    }
  }
`;

const main = async (timestamp = null) => {
  const [block, blockPrior] = await utils.getBlocks('binance', timestamp, [
    url,
  ]);

  // pull data
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.farms;

  const pools = dataNow.map((p) => {
    const symbol0 = p.stakeToken.isLpToken ? 
      utils.formatSymbol(`${p.stakeToken.token0.symbol}/${p.stakeToken.token1.symbol}`) :
      utils.formatSymbol(p.stakeToken.symbol);
    const symbol1 = utils.formatSymbol(p.rewardToken.symbol);
    const symbol = utils.formatSymbol(`${symbol0}-${symbol1}`);
    const underlyingTokens = [p.stakeToken.id, p.rewardToken.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];

    return {
      pool: p.id,
      chain: utils.formatChain('binance'),
      project: 'babydoge',
      symbol,
      tvlUsd: p.totalStakedUsdValue,
      apyBase: p.APR,
      underlyingTokens,
    };
  });

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://babydogeswap.com/farms',
};
