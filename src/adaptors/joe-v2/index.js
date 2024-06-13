const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const chains = {
  avalanche: sdk.graph.modifyEndpoint(
    '6KD9JYCg2qa3TxNK3tLdhj5zuZTABoLLNcnUZXKG9vuH'
  ),
  arbitrum: sdk.graph.modifyEndpoint(
    '9RoEdAwZiP651miLbKLYQczjckg7HxmyoKXWYXBDYsJc'
  ),
  bsc: sdk.graph.modifyEndpoint('9ANwfoCsnDa2fREYqEpGxWcTQHsmBDeTkdSDXGYAspN7'),
};

const query = gql`
  {
    lbpairs (first: 1000 block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0: reserveX
      reserve1: reserveY
      token0: tokenX {
        id
        symbol
      }
      token1: tokenY {
        id
        symbol
      }
      feeTier: baseFeePct
    }
  }
`;

const queryPrior = gql`
  {
    lbpairs (first: 1000 block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const topLvl = async (chainString, timestamp, url) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  let dataNow = (await request(url, query.replace('<PLACEHOLDER>', block)))
    .lbpairs;

  const dataPrior = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
  ).lbpairs;

  const dataPrior7d = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  ).lbpairs;

  dataNow = await utils.tvl(
    dataNow,
    chainString === 'avalanche' ? 'avax' : chainString
  );
  dataNow = dataNow.map((p) => ({ ...p, feeTier: p.feeTier * 10000 }));

  let data = dataNow.map((el) =>
    utils.apy(el, dataPrior, dataPrior7d, 'joe-v2')
  );

  return data.map((p) => {
    const apyFee = Number(p.apy1d);
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'joe-v2',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: apyFee,
      underlyingTokens: [p.token0.id, p.token1.id],
      apyBase7d: p.apy7d,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });
};

const main = async (timestamp = null) => {
  const pools = await Promise.all(
    Object.keys(chains).map((chain) => topLvl(chain, timestamp, chains[chain]))
  );

  return pools.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://traderjoexyz.com/pool',
};
