const superagent = require('superagent');
const { request, gql } = require('graphql-request');

exports.formatChain = (chain) => chain.charAt(0).toUpperCase() + chain.slice(1);

// replace / with - and trim potential whitespace
exports.formatSymbol = (symbol) =>
  symbol
    .replace(/[_+\/]/g, '-')
    .replace(/\s/g, '')
    .trim();

exports.getData = async (url, query = null) => {
  if (query !== null) {
    res = await superagent.post(url).send(query);
  } else {
    res = await superagent.get(url);
  }
  res = res.body;
  return res;
};

exports.getCGpriceData = async (tokenString, symbols, chainId = 'ethereum') => {
  let url = 'https://api.coingecko.com/api/v3/simple/';
  if (symbols === true) {
    url = `${url}price?ids=${tokenString}&vs_currencies=usd`;
  } else {
    url = `${url}token_price/${chainId}?contract_addresses=${tokenString}&vs_currencies=usd`;
  }

  let res = await superagent.get(url);
  res = res.body;
  return res;
};

// retrive block based on unixTimestamp array
exports.getBlocksByTime = async (timestamps, chainString) => {
  const urlsKeys = {
    ethereum: {
      url: 'https://api.etherscan.io',
      key: process.env.ETHERSCAN,
    },
    polygon: {
      url: 'https://api.polygonscan.com',
      key: process.env.POLYGONSCAN,
    },
    avalanche: {
      url: 'https://api.snowtrace.io',
      key: process.env.SNOWTRACE,
    },
    arbitrum: {
      url: 'https://api.arbiscan.io',
      key: process.env.ARBISCAN,
    },
    optimism: {
      url: 'https://api-optimistic.etherscan.io',
      key: process.env.OPTIMISM,
    },
    xdai: {
      url: 'https://blockscout.com/xdai/mainnet',
      key: process.env.XDAI,
    }
  };

  const blocks = [];
  for (const timestamp of timestamps) {
    const url =
      `${urlsKeys[chainString].url}/api?module=block&action=getblocknobytime&timestamp=` +
      timestamp +
      '&closest=before&apikey=' +
      urlsKeys[chainString].key;

    const response = await superagent.get(url);

    let blockNumber;

    if (url.includes("blockscout")) {
      blockNumber = response.body.result.blockNumber
    } else {
      blockNumber = response.body.result
    }

    blocks.push(parseInt(blockNumber));
  }
  return blocks;
};

const getLatestBlockSubgraph = async (url) => {
  const queryGraph = gql`
    {
      indexingStatusForCurrentVersion(subgraphName: "<PLACEHOLDER>") {
        chains {
          latestBlock {
            number
          }
        }
      }
    }
  `;

  const blockGraph = await request(
    'https://api.thegraph.com/index-node/graphql',
    queryGraph.replace('<PLACEHOLDER>', url.split('name/')[1])
  );

  return Number(
    blockGraph.indexingStatusForCurrentVersion.chains[0].latestBlock.number
  );
};

// func which queries subgraphs for their latest block nb and compares it against
// the latest block from etherscan api, if within a certain bound -> ok, otherwise
// will break as data is stale
exports.getBlocks = async (chainString, tsTimeTravel, urlArray) => {
  const timestamp =
    tsTimeTravel !== null
      ? Number(tsTimeTravel)
      : Math.floor(Date.now() / 1000);

  const offset = 86400;
  const timestampPrior = timestamp - offset;
  let [block, blockPrior] = await this.getBlocksByTime(
    [timestamp, timestampPrior],
    chainString
  );

  // in case of standard run, we ping the subgraph and check its latest block
  // ideally its synced with the block from getBlocksByTime. if the delta is too large
  // throwing an error
  if (tsTimeTravel === null) {
    const blocksPromises = [];
    for (const url of urlArray.filter((el) => el !== null)) {
      blocksPromises.push(getLatestBlockSubgraph(url));
    }
    const blocks = await Promise.all(blocksPromises);
    // we use oldest block
    blockGraph = Math.min(...blocks);

    // calc delta
    blockDelta = Math.abs(block - blockGraph);

    // check delta (keeping this large for now)
    const thr = chainString === 'ethereum' ? 300 : 3000;
    if (blockDelta > thr) {
      console.log(`block: ${block}, blockGraph: ${blockGraph}`);
      throw new Error(`Stale subgraph of ${blockDelta} blocks!`);
    }

    block = blockGraph;
  }
  return [block, blockPrior];
};

// calculate tvl in usd based on subgraph data.
// reserveUSD field from subgraphs can be unreliable, using defillama price api instead
exports.tvl = async (dataNow, networkString) => {
  // changing the string for avax so it matches the defillama price api
  networkString = networkString === 'avalanche' ? 'avax' : networkString;
  // make copy
  const dataNowCopy = dataNow.map((el) => ({ ...el }));

  // extract unique token id's
  const ids = [];
  for (const e of dataNowCopy) {
    ids.push([
      `${networkString}:${e.token0.id}`,
      `${networkString}:${e.token1.id}`,
    ]);
  }
  let idsSet = [...new Set(ids.flat())];

  // pull token prices
  let prices = await this.getData('https://coins.llama.fi/prices', {
    coins: idsSet,
  });
  prices = prices.coins;

  // calc tvl
  for (const el of dataNowCopy) {
    let price0 = prices[`${networkString}:${el.token0.id}`]?.price;
    let price1 = prices[`${networkString}:${el.token1.id}`]?.price;

    if (price0 !== undefined && price1 !== undefined) {
      tvl = Number(el.reserve0) * price0 + Number(el.reserve1) * price1;
    } else if (price0 !== undefined && price1 === undefined) {
      tvl = Number(el.reserve0) * price0 * 2;
    } else if (price0 === undefined && price1 !== undefined) {
      tvl = Number(el.reserve1) * price1 * 2;
    } else {
      tvl = 0;
    }

    el['totalValueLockedUSD'] = tvl;
  }

  return dataNowCopy;
};

exports.aprToApy = (apr, compoundFrequency = 365) => {
  return (
    ((1 + (apr * 0.01) / compoundFrequency) ** compoundFrequency - 1) * 100
  );
};
// calculating apy based on subgraph data
exports.apy = (entry, dataPrior, version) => {
  entry = { ...entry };

  // uni v2 forks set feeTier to constant
  if (version === 'v2') {
    entry['feeTier'] = 3000;
  }

  // calc prior volume on 24h offset
  entry['volumeUSDPrior'] = dataPrior.find(
    (el) => el.id === entry.id
  )?.volumeUSD;

  // calc 24h volume
  entry['volumeUSD24h'] =
    Number(entry.volumeUSD) - Number(entry.volumeUSDPrior);

  // calc fees
  entry['feeUSD24h'] = (entry.volumeUSD24h * Number(entry.feeTier)) / 1e6;

  // annualise
  entry['feeUSD365days'] = entry.feeUSD24h * 365;

  // calc apy
  entry['apy'] = (entry.feeUSD365days / entry.totalValueLockedUSD) * 100;

  return entry;
};
