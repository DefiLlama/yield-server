const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'FEtpnfQ1aqF8um2YktEkfzFD11ZKrfurvBLPeQzv9JB1'
  ),
  base: sdk.graph.modifyEndpoint(
    '4jGhpKjW4prWoyt5Bwk1ZHUwdEmNWveJcjEyjoTZWCY9'
  ),
};

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
  const timestampForBlocks =
    timestamp != null ? Number(timestamp) : Math.floor(Date.now() / 1000);
  const [[block, blockPrior], [blockPrior7d]] = await Promise.all([
    utils.getBlocks(chainString, timestamp, [url]),
    utils.getBlocksByTime([timestampForBlocks - 604800], chainString),
  ]);

  // pull data
  let queryC = query;
  let queryPriorC = queryPrior;
  let [dataNow, dataPrior, dataPrior7d] = await Promise.all([
    request(url, queryC.replace('<PLACEHOLDER>', block)),
    request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior)),
    request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d)),
  ]);
  dataNow = dataNow.pairs;
  dataPrior = dataPrior.pairs;
  dataPrior7d = dataPrior7d.pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  return dataNow.map((p) => {
    const symbol = `${p.token0.symbol}-${p.token1.symbol}`;
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString === 'ethereum' ? 'mainnet' : chainString;
    const url = `https://app.uniswap.org/positions/create/v2?currencyA=${token0}&currencyB=${token1}&chain=${chain}`;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'uniswap-v2',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens,
      url,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });
};

const main = async (timestamp = null) => {
  let data = (
    await Promise.all(
      Object.entries(chains).map(async ([chain, url]) => {
        try {
          console.log(`Fetching data for ${chain}...`);
          return await topLvl(chain, url, query, queryPrior, 'v2', timestamp);
        } catch (err) {
          console.log(chain, err);
          return [];
        }
      })
    )
  ).flat();

  const pools = await addMerklRewardApy(
    data.filter((p) => utils.keepFinite(p)),
    'uniswap'
  );

  return pools;
};

module.exports = {
  protocolId: '2197',
  timetravel: false,
  apy: main,
};
