const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://info.hydradex.org/graphql';

const pairsQuery = gql`
  {
    pairs(first: 1000, orderBy: "trackedReserveHYDRA", orderDirection: "desc") {
      id
    }
  }
`;
const query = gql`
  {
    pairs(first: 1000, orderBy: "trackedReserveHYDRA", orderDirection: "desc", block: {number: <PLACEHOLDER>}, where: {id_in: <ID_PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
      reserveUSD
      token0 {
        symbol
        tokenAddress
      }
      token1 {
        symbol
        tokenAddress
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs(first: 1000, orderBy: "trackedReserveHYDRA", orderDirection: "desc", block: {number: <PLACEHOLDER>}, where: {id_in: <ID_PLACEHOLDER>}) {
      id
      volumeUSD
      reserveUSD
    }
  }
`;

const queryBlocks = gql`
  {
    blocks(
      orderBy: "height"
      first: 1
      orderDirection: "desc"
      where: { timestamp_lte: <PLACEHOLDER> }
    ) {
      number
    }
  }
`;

const getV2Blocks = async (tsTimeTravel, offset = 86400) => {
  const timestamp =
    tsTimeTravel !== null
      ? Number(tsTimeTravel)
      : Math.floor(Date.now() / 1000);

  const timestampPrior = timestamp - offset;

  const blocks = [];
  for (const ts of [timestamp, timestampPrior]) {
    const data = (await request(url, queryBlocks.replace('<PLACEHOLDER>', ts)))
      .blocks;
    blocks.push(data[0].number);
  }

  return blocks;
};

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
  const [block, blockPrior] = await getV2Blocks(timestamp);

  const [_, blockPrior7d] = await getV2Blocks(timestamp, 604800);
  // Hotfix for v2 graph bug
  const pairIds = JSON.stringify(
    (await request(url, pairsQuery))?.pairs?.map((pair) => pair?.id)
  );

  // pull data
  let queryC = query;
  let dataNow = await request(
    url,
    queryC.replace('<PLACEHOLDER>', block).replace('<ID_PLACEHOLDER>', pairIds)
  );
  dataNow = dataNow.pairs;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC
      .replace('<PLACEHOLDER>', blockPrior)
      .replace('<ID_PLACEHOLDER>', pairIds)
  );
  dataPrior = dataPrior.pairs;

  // 7d offset
  const dataPrior7d = (
    await request(
      url,
      queryPriorC
        .replace('<PLACEHOLDER>', blockPrior7d)
        .replace('<ID_PLACEHOLDER>', pairIds)
    )
  ).pairs;

  // calculate tvl
  dataNow = dataNow.map((x) => {
    x.totalValueLockedUSD = Number(x.reserveUSD);
    delete x.reserveUSD;
    return x;
  });

  // calculate apy
  dataNow = dataNow
    .filter((x) => x.token0.symbol)
    .map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  return dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.tokenAddress, p.token1.tokenAddress];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString === 'hydra' ? 'mainnet' : chainString;
    const url = `https://hydradex.org/#/add/v2/${token0}/${token1}`;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'hydradex-v2',
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
  let data = await topLvl('hydra', url, query, queryPrior, 'v2', timestamp);
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
