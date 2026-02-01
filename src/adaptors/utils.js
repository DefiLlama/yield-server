const superagent = require('superagent');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const { chunk } = require('lodash');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');

exports.formatAddress = (address) => {
  return String(address).toLowerCase();
};

exports.formatChain = (chain) => {
  if (chain && chain.toLowerCase() === 'xdai') return 'Gnosis';
  if (chain && chain.toLowerCase() === 'kcc') return 'KCC';
  if (chain && chain.toLowerCase() === 'okexchain') return 'OKExChain';
  if (chain && chain.toLowerCase() === 'bsc') return 'Binance';
  if (chain && chain.toLowerCase() === 'milkomeda') return 'Milkomeda C1';
  if (chain && chain.toLowerCase() === 'milkomeda_a1') return 'Milkomeda A1';
  if (chain && chain.toLowerCase() === 'boba_avax') return 'Boba_Avax';
  if (chain && chain.toLowerCase() === 'boba_bnb') return 'Boba_Bnb';
  if (chain && chain.toLowerCase() === 'iotaevm') return 'IOTA EVM';
  if (
    chain &&
    (chain.toLowerCase() === 'zksync_era' ||
      chain.toLowerCase() === 'zksync era' ||
      chain.toLowerCase() === 'era')
  )
    return 'zkSync Era';
  if (chain && chain.toLowerCase() === 'polygon_zkevm') return 'Polygon zkEVM';
  if (chain && chain.toLowerCase() === 'real') return 're.al';
  if (chain && chain.toLowerCase() === 'plume_mainnet') return 'Plume Mainnet';
  return chain.charAt(0).toUpperCase() + chain.slice(1);
};

const getFormatter = (symbol) => {
  if (symbol.includes('USD+')) return /[_:\/]/g;
  return /[_+:\/]/g;
};

// replace / with - and trim potential whitespace
// set mimatic to mai, uppercase all symbols
exports.formatSymbol = (symbol) => {
  return symbol
    .replace(getFormatter(symbol), '-')
    .replace(/\s/g, '')
    .trim()
    .toLowerCase()
    .replaceAll('mimatic', 'mai')
    .toUpperCase();
};

exports.getData = async (url, query = null) => {
  let res;
  if (query !== null) {
    res = await superagent.post(url).send(query);
  } else {
    res = await superagent.get(url);
  }
  return res.body;
};

// retrive block based on unixTimestamp array
const getBlocksByTime = async (timestamps, chainString) => {
  const chain = chainString === 'avalanche' ? 'avax' : chainString;
  const blocks = [];
  for (const timestamp of timestamps) {
    const response = await superagent.get(
      `https://coins.llama.fi/block/${chain}/${timestamp}`
    );
    blocks.push(response.body.height);
  }
  return blocks;
};

exports.getBlocksByTime = getBlocksByTime;

const getLatestBlockSubgraph = async (url) => {
  const queryGraph = gql`
    {
      _meta {
        block {
          number
        }
      }
    }
  `;

  const blockGraph =
    url.includes('https://gateway-arbitrum.network.thegraph.com/api') ||
    url.includes('metis-graph.maiadao.io') ||
    url.includes('babydoge/faas') ||
    url.includes('kybernetwork/kyberswap-elastic-cronos') ||
    url.includes('kybernetwork/kyberswap-elastic-matic') ||
    url.includes('metisapi.0xgraph.xyz/subgraphs/name') ||
    url.includes(
      'https://subgraph.satsuma-prod.com/09c9cf3574cc/orbital-apes/v3-subgraph/api'
    ) ||
    url.includes('api.goldsky.com') ||
    url.includes('api.studio.thegraph.com') ||
    url.includes('48211/uniswap-v3-base') ||
    url.includes('horizondex/block') ||
    url.includes('pancake-swap.workers.dev') ||
    url.includes('pancakeswap/exchange-v3-linea') ||
    url.includes('exchange-v3-polygon-zkevm/version/latest') ||
    url.includes('exchange-v3-zksync/version/latest') ||
    url.includes('balancer-base-v2/version/latest') ||
    url.includes('horizondex') ||
    url.includes('swopfi-units')
      ? await request(url, queryGraph)
      : url.includes('aperture/uniswap-v3')
      ? await request(
          'https://api.goldsky.com/api/public/project_clnz7akg41cv72ntv0uhyd3ai/subgraphs/aperture/manta-pacific-blocks/gn',
          queryGraph
        )
      : await request(
          `https://api.thegraph.com/subgraphs/name/${url.split('name/')[1]}`,
          queryGraph
        );

  // return Number(
  //   blockGraph.indexingStatusForCurrentVersion.chains[0].latestBlock.number
  // );
  return Number(blockGraph._meta.block.number);
};

// func which queries subgraphs for their latest block nb and compares it against
// the latest block from https://coins.llama.fi/block/, if within a certain bound -> ok, otherwise
// will break as data is stale
exports.getBlocks = async (
  chainString,
  tsTimeTravel,
  urlArray,
  offset = 86400
) => {
  const timestamp =
    tsTimeTravel !== null
      ? Number(tsTimeTravel)
      : Math.floor(Date.now() / 1000);

  const timestampPrior = timestamp - offset;
  let [block, blockPrior] = await getBlocksByTime(
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
    const blockGraph = Math.min(...blocks);
    // calc delta
    const blockDelta = Math.abs(block - blockGraph);

    // check delta (keeping this large for now)
    const thr =
      chainString === 'ethereum' ? 300 : chainString === 'cronos' ? 6000 : 3000;
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

  const formatId = (id) => `${networkString}:${String(id).toLowerCase()}`;
  const idsSet = Array.from(
    new Set(
      dataNowCopy.flatMap((pool) => [
        formatId(pool.token0.id),
        formatId(pool.token1.id),
      ])
    )
  );

  // price endpoint seems to break with too many tokens, splitting it to max 50 per request
  const fetchTokenPrices = async (tokenIds) => {
    const idList = tokenIds.join(',').replaceAll('/', '');
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${idList}`
    );
    return data.coins;
  };

  const prices = {};
  for (let index = 0; index < idsSet.length; index += 50) {
    const chunk = idsSet.slice(index, index + 50);
    const chunkPrices = await fetchTokenPrices(chunk);
    Object.assign(prices, chunkPrices);
  }

  // calc tvl
  for (const el of dataNowCopy) {
    let price0 = prices[formatId(el.token0.id)]?.price;
    let price1 = prices[formatId(el.token1.id)]?.price;
    let tvl;

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
    el['price0'] = price0;
    el['price1'] = price1;
  }

  return dataNowCopy;
};

exports.aprToApy = (apr, compoundFrequency = 365) => {
  return (
    ((1 + (apr * 0.01) / compoundFrequency) ** compoundFrequency - 1) * 100
  );
};

exports.apyToApr = (apy, compoundFrequency = 365) => {
  return (
    (((apy / 100 + 1) ** (1 / compoundFrequency) - 1) * compoundFrequency) /
    0.01
  );
};

// calculating apy based on subgraph data
exports.apy = (pool, dataPrior1d, dataPrior7d, version) => {
  pool = { ...pool };

  // uni v2 forks set feeTier to constant
  if (version === 'v2') {
    pool['feeTier'] = 3000;
  } else if (version === 'stellaswap') {
    pool['feeTier'] = 2000;
  } else if (version === 'baseswap') {
    pool['feeTier'] = 1700;
  } else if (version === 'zyberswap') {
    pool['feeTier'] = 1500;
  } else if (version === 'arbidex') {
    pool['feeTier'] = 500;
  }

  // calc prior volume on 24h offset
  pool['volumeUSDPrior1d'] = dataPrior1d.find(
    (el) => el.id === pool.id
  )?.volumeUSD;

  pool['volumeUSDPrior7d'] = dataPrior7d.find(
    (el) => el.id === pool.id
  )?.volumeUSD;

  // calc 24h volume
  pool['volumeUSD1d'] = Number(pool.volumeUSD) - Number(pool.volumeUSDPrior1d);
  pool['volumeUSD7d'] = Number(pool.volumeUSD) - Number(pool.volumeUSDPrior7d);

  if (
    pool.volumeToken0 &&
    (pool['volumeUSD1d'] === 0 || pool['volumeUSD7d'] === 0)
  ) {
    const poolDataPrior1D = dataPrior1d.find((el) => el.id === pool.id);
    const poolDataPrior7D = dataPrior7d.find((el) => el.id === pool.id);

    if (pool['volumeUSD1d'] === 0 && poolDataPrior1D) {
      const volumeToken0 =
        Number(pool.volumeToken0) - Number(poolDataPrior1D.volumeToken0);
      pool['volumeUSD1d'] = volumeToken0 * pool.price0;
    }
    if (pool['volumeUSD7d'] === 0 && poolDataPrior7D) {
      const volumeToken0 =
        Number(pool.volumeToken0) - Number(poolDataPrior7D.volumeToken0);
      pool['volumeUSD7d'] = volumeToken0 * pool.price0;
    }
  }

  // calc fees
  pool['feeUSD1d'] = (pool.volumeUSD1d * Number(pool.feeTier)) / 1e6;
  pool['feeUSD7d'] = (pool.volumeUSD7d * Number(pool.feeTier)) / 1e6;

  // annualise
  pool['feeUSDyear1d'] = pool.feeUSD1d * 365;
  pool['feeUSDyear7d'] = pool.feeUSD7d * 52;

  // calc apy
  pool['apy1d'] = (pool.feeUSDyear1d / pool.totalValueLockedUSD) * 100;
  pool['apy7d'] = (pool.feeUSDyear7d / pool.totalValueLockedUSD) * 100;

  return pool;
};

exports.keepFinite = (p) => {
  if (
    !['apyBase', 'apyReward', 'apy']
      .map((f) => Number.isFinite(p[f]))
      .includes(true)
  )
    return false;

  return Number.isFinite(p['tvlUsd']);
};

exports.getPrices = async (addresses, chain) => {
  const priceKeys = chain
    ? addresses.map((address) => `${chain}:${address}`)
    : addresses;
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${priceKeys
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [address, price]) => ({
      ...acc,
      [address.split(':')[1].toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  return { pricesBySymbol, pricesByAddress };
};

///////// UNISWAP V2

const calculateApy = (
  poolInfo,
  totalAllocPoint,
  rewardPerBlock,
  rewardPrice,
  reserveUSD,
  blocksPerYear
) => {
  const poolWeight = poolInfo.allocPoint / totalAllocPoint;
  const tokensPerYear = blocksPerYear * rewardPerBlock;

  return ((poolWeight * tokensPerYear * rewardPrice) / reserveUSD) * 100;
};

const calculateReservesUSD = (
  reserves,
  reservesRatio,
  token0,
  token1,
  tokenPrices
) => {
  const { decimals: token0Decimals, id: token0Address } = token0;
  const { decimals: token1Decimals, id: token1Address } = token1;
  const token0Price = tokenPrices[token0Address.toLowerCase()];
  const token1Price = tokenPrices[token1Address.toLowerCase()];

  const reserve0 = new BigNumber(reserves._reserve0)
    .times(reservesRatio)
    .times(10 ** (18 - token0Decimals));
  const reserve1 = new BigNumber(reserves._reserve1)
    .times(reservesRatio)
    .times(10 ** (18 - token1Decimals));

  if (token0Price) return reserve0.times(token0Price).times(2).div(1e18);
  if (token1Price) return reserve1.times(token1Price).times(2).div(1e18);
};

const getPairsInfo = async (pairs, url) => {
  const pairQuery = gql`
    query pairQuery($id_in: [ID!]) {
      pairs(where: { id_in: $id_in }) {
        name
        id
        token0 {
          decimals
          id
        }
        token1 {
          decimals
          id
        }
      }
    }
  `;
  const pairInfo = await Promise.all(
    chunk(pairs, 7).map((tokens) =>
      request(url, pairQuery, {
        id_in: tokens.map((pair) => pair.toLowerCase()),
      })
    )
  );

  return pairInfo
    .map(({ pairs }) => pairs)
    .flat()
    .reduce((acc, pair) => ({ ...acc, [pair.id.toLowerCase()]: pair }), {});
};

exports.uniswap = { calculateApy, calculateReservesUSD, getPairsInfo };

/// MULTICALL

const makeMulticall = async (abi, addresses, chain, params = null) => {
  const data = await sdk.api.abi.multiCall({
    abi,
    calls: addresses.map((address) => ({
      target: address,
      params,
    })),
    chain,
    permitFailure: true,
  });

  const res = data.output.map(({ output }) => output);

  return res;
};

exports.makeMulticall = makeMulticall;

const capitalizeFirstLetter = (str) => {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
};

exports.capitalizeFirstLetter = capitalizeFirstLetter;

exports.removeDuplicates = (pools) => {
  const seen = {};
  return pools.filter((i) => {
    return seen.hasOwnProperty(i.pool) ? false : (seen[i.pool] = true);
  });
};

exports.getERC4626Info = async (
  address,
  chain,
  timestamp = Math.floor(Date.now() / 1e3),
  {
    assetUnit = '100000000000000000',
    totalAssetsAbi = 'uint:totalAssets',
    convertToAssetsAbi = 'function convertToAssets(uint256 shares) external view returns (uint256)',
  } = {}
) => {
  const DAY = 24 * 3600;

  const [blockNow, blockYesterday] = await Promise.all(
    [timestamp, timestamp - DAY].map((time) =>
      axios
        .get(`https://coins.llama.fi/block/${chain}/${time}`)
        .then((r) => r.data.height)
    )
  );
  const [tvl, priceNow, priceYesterday] = await Promise.all([
    sdk.api.abi.call({
      target: address,
      block: blockNow,
      abi: totalAssetsAbi,
      chain: chain,
    }),
    sdk.api.abi.call({
      target: address,
      block: blockNow,
      abi: convertToAssetsAbi,
      params: [assetUnit],
      chain: chain,
    }),
    sdk.api.abi.call({
      target: address,
      block: blockYesterday,
      abi: convertToAssetsAbi,
      params: [assetUnit],
      chain: chain,
    }),
  ]);
  const apy = (priceNow.output / priceYesterday.output) ** 365 * 100 - 100;
  return {
    pool: address,
    chain,
    tvl: tvl.output,
    apyBase: apy,
  };
};

// solana
exports.getTotalSupply = async (tokenMintAddress) => {
  const rpcUrl = 'https://api.mainnet-beta.solana.com';
  const requestBody = {
    jsonrpc: '2.0',
    id: 1,
    method: 'getTokenSupply',
    params: [
      tokenMintAddress,
      {
        commitment: 'confirmed',
      },
    ],
  };

  const response = await axios.post(rpcUrl, requestBody, {
    headers: {
      'Content-Type': 'application/json',
    },
  });

  const data = response.data;
  if (data.error) {
    throw new Error(`Error fetching total supply: ${data.error.message}`);
  }

  const totalSupply = data.result.value.amount;
  const decimals = data.result.value.decimals;
  const supplyInTokens = totalSupply / Math.pow(10, decimals);

  return supplyInTokens;
};
