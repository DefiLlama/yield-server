const { request, gql } = require('graphql-request');
const utils = require('../utils');

const SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v2/latest/gn';
const FACTORY_ADDRESS = '0x16b619B04c961E8f4F06C10B42FDAbb328980A89';
const CHAIN = 'flare';

const query = gql`
  {
    pairs(first: 1000, orderBy: liquidityUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
      liquidityUSD
      feesUSD
      token0 {
        symbol
        id
        decimals
      }
      token1 {
        symbol
        id
        decimals
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs(first: 1000, orderBy: liquidityUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
    }
  }
`;

const fetchSparkDexV2Data = async (timestamp = null) => {
  try {
    // Get blocks for time travel
    const [block, blockPrior] = await utils.getBlocks(CHAIN, timestamp, [SUBGRAPH_URL]);
    const [_, blockPrior7d] = await utils.getBlocks(CHAIN, timestamp, [SUBGRAPH_URL], 604800);

    // Fetch current data
    let dataNow = await request(SUBGRAPH_URL, query.replace('<PLACEHOLDER>', block));
    dataNow = dataNow.pairs;

    // Fetch 24h offset data for volume calculation
    let dataPrior = await request(SUBGRAPH_URL, queryPrior.replace('<PLACEHOLDER>', blockPrior));
    dataPrior = dataPrior.pairs;

    // Fetch 7d offset data
    const dataPrior7d = await request(SUBGRAPH_URL, queryPrior.replace('<PLACEHOLDER>', blockPrior7d));
    const dataPrior7dPairs = dataPrior7d.pairs;

    // Process token reserves with proper decimals before TVL calculation
    dataNow = dataNow.map((pair) => {
      const token0Decimals = parseInt(pair.token0.decimals);
      const token1Decimals = parseInt(pair.token1.decimals);
      
      // Convert reserves from wei to actual token amounts
      const reserve0 = Number(pair.reserve0) / Math.pow(10, token0Decimals);
      const reserve1 = Number(pair.reserve1) / Math.pow(10, token1Decimals);
      
      return {
        ...pair,
        reserve0: reserve0.toString(),
        reserve1: reserve1.toString(),
      };
    });

    // Calculate TVL
    dataNow = await utils.tvl(dataNow, CHAIN);
    
    // Calculate APY
    dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7dPairs, 'v2'));

    // Format pools
    return dataNow.map((p) => {
      const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
      const underlyingTokens = [p.token0.id, p.token1.id];
      
      return {
        pool: `${p.id}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'sparkdex-v2',
        symbol,
        tvlUsd: p.totalValueLockedUSD,
        apyBase: p.apy1d,
        apyBase7d: p.apy7d,
        underlyingTokens,
        url: `https://sparkdex.ai/pool`,
        volumeUsd1d: p.volumeUSD1d,
        volumeUsd7d: p.volumeUSD7d,
        poolMeta: 'Uniswap V2',
      };
    });
  } catch (error) {
    console.error('Error fetching SparkDEX V2 data:', error);
    return [];
  }
};

const main = async (timestamp = null) => {
  try {
    console.log('Fetching SparkDEX V2 data for Flare chain...');
    const data = await fetchSparkDexV2Data(timestamp);
    
    // Filter out pools with invalid data
    const validPools = data.filter((p) => utils.keepFinite(p));
    
    console.log(`Found ${validPools.length} valid pools`);
    return validPools;
  } catch (error) {
    console.error('Error in main function:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://sparkdex.ai/pool',
};
