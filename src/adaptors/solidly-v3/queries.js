const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');
const axios = require('axios');
const ethers = require('ethers');
const ABI = require('./abi');

// Chain Configuration
const CHAIN_CONFIG = [
  {
    chain: 'ethereum',
    graphId: '7StqFFqbxi3jcN5C9YxhRiTxQM8HA8XEHopsynqqxw3t',
    alchemyUrl: 'https://eth-mainnet.g.alchemy.com/v2/',
    chainId: 1,
    solid: '0x777172d858dc1599914a1c4c6c9fc48c99a60990'
  },
  {
    chain: 'optimism',
    graphId: 'HCThb3gJC45qUYmNEaYmZZTqJW3pSq7X6tb4MqNHEvZf',
    alchemyUrl: 'https://opt-mainnet.g.alchemy.com/v2/',
    chainId: 10,
    solid: '0x777CF5ba9C291A1A8f57FF14836F6F9dC5c0F9Dd' 
  },
  {
    chain: 'base',
    graphId: 'C8G1vfqsgWTg4ydzxWdsLj1jCKsxAKFamP5GjuSdRF8W',
    alchemyUrl: 'https://base-mainnet.g.alchemy.com/v2/',
    chainId: 8453,
    solid: '0x777CF5ba9C291A1A8f57FF14836F6F9dC5c0F9Dd',
    blacklistedPools:['0xccc1decbedfa4f8a0d556f30e0a33522e476e7bc'.toLowerCase()] 
  },
  {
    chain: 'arbitrum',
    graphId: 'ALCsbp7jWC6EQjwgicvZkG6dDEFGMV32QUZJvJGqL9Kx',
    alchemyUrl: 'https://arb-mainnet.g.alchemy.com/v2/',
    chainId: 42161,
    solid: '0x777CF5ba9C291A1A8f57FF14836F6F9dC5c0F9Dd' 
  },
  {
    chain: 'sonic',
    graphId: '6m7Dp7MFFLW1V7csgeBxqm9khNkfbn2U9qgADSdECfMA',
    alchemyUrl: 'https://sonic-mainnet.g.alchemy.com/v2/',
    chainId: 146,
    solid: '0x777CF5ba9C291A1A8f57FF14836F6F9dC5c0F9Dd' 
  },
  {
    chain: 'fantom',
    graphId: 'HDNu25S2uqr13BHrQdPv2PfTpwxJgPB7QEnC8fsgKcM9',
    alchemyUrl: 'https://fantom-mainnet.g.alchemy.com/v2/',
    chainId: 250,
    solid: '0x777CF5ba9C291A1A8f57FF14836F6F9dC5c0F9Dd' 
  },
].map(config => ({
  ...config,
  solid: config.solid.toLowerCase()
}));

const ZERO = ethers.BigNumber.from(0);

// GraphQL query for pool data
const GET_POOLS = gql`
  {
    pools(where: { sqrtPrice_gt: "0", liquidity_gt: "0" }) {
      id
      tick
      totalValueLockedToken0
      totalValueLockedToken1
      tickSpacing
      sqrtPrice
      liquidity
      feeTier
      token0 {
        id
        symbol
        decimals
      }
      token1 {
        id
        symbol
        decimals
      }
      lpSolidEmissions(where: {period_lte: <TIMESTAMP_NOW>}) {
        period
        amount
      }
      lpTokenIncentives(where: {periodStart_lte: <TIMESTAMP_NOW>}) {
        periodStart
        periodEnd
        amount
        token
      }
    }
  }
`;

/**
 * Gets the chain configuration for a specific chain
 * @param {string} chain - Chain name
 * @returns {Object} Chain configuration
 */
function getChainConfig(chain) {
  return CHAIN_CONFIG.find(c => c.chain === chain) || CHAIN_CONFIG[0];
}

/**
 * Converts BigNumber to float with proper decimals
 * @param {BigNumber} v - The BigNumber value
 * @param {number} decimals - Number of decimals
 * @returns {number} Float representation of the BigNumber
 */
function bnToFloat(v, decimals) {
  const fixedNumber = ethers.FixedNumber.from(v.toString());
  const divisor = ethers.FixedNumber.from(
    ethers.BigNumber.from(10).pow(decimals)
  );
  return fixedNumber.divUnsafe(divisor).toUnsafeFloat();
}

/**
 * Gets the Graph URL for a specific chain
 * @param {string} chain - Chain name
 * @returns {string} Modified graph endpoint
 */
function getGraphUrl(chain) {
  const config = getChainConfig(chain);
  return sdk.graph.modifyEndpoint(config.graphId);
}

/**
 * Gets the SOLID token address for a specific chain
 * @param {string} chain - Chain name
 * @returns {string} SOLID token address
 */
function getSolid(chain) {
  return getChainConfig(chain).solid;
}

/**
 * Gets the block number from 24 hours ago
 * @param {number} now - Current timestamp
 * @param {string} chain - Chain name
 * @returns {Promise<number>} Block number from 24 hours ago
 */
async function getBlock24hAgo(now, chain) {
  const startTime = now - 3600 * 24;
  const response = await axios.get(`https://coins.llama.fi/block/${chain}/${startTime}`);
  return response.data.height;
}

/**
 * Fetches state changes for a specific pool
 * @param {string} poolId - Pool ID
 * @param {number} blockStart - Starting block number
 * @param {string} chain - Chain name
 * @returns {Promise<Object>} Pool state changes
 */
async function getPoolStateChanges(poolId, blockStart, chain) {
  const config = getChainConfig(chain);
  
  try {
    const ALCHEMY_CONNECTION_ETHEREUM = process.env.ALCHEMY_CONNECTION_ETHEREUM;
    //we need to extract the api key from the alchemy connection string
    const apiKey = ALCHEMY_CONNECTION_ETHEREUM.split('/').pop();

    const provider = new ethers.providers.JsonRpcProvider(
      `${config.alchemyUrl}${apiKey}`,
      config.chainId
    );
    
    const contract = new ethers.Contract(poolId, ABI, provider);
    const [, , beginFee] = await contract.functions.slot0({ blockTag: blockStart });
    
    const swaps = await contract.queryFilter(
      contract.filters.Swap(),
      blockStart
    );
    
    const feeChanges = await contract.queryFilter(
      contract.filters.SetFee(),
      blockStart
    );
    
    const stateChanges = [...swaps, ...feeChanges].sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      return a.logIndex - b.logIndex;
    });
    
    return {
      begin_fee: beginFee,
      state_changes: stateChanges
    };
  } catch (error) {
    console.error(`${chain} Error fetching pool state changes for ${poolId}:`, error);
    throw error;
  }
}

/**
 * Fetches all pools data from subgraph
 * @param {number} now - Current timestamp
 * @param {string} chain - Chain name
 * @returns {Promise<Object>} Pools data and touched tokens
 */
async function fetchPools(now, chain) {
  const config = getChainConfig(chain);
  const GRAPH = sdk.graph.modifyEndpoint(config.graphId);
  
  const oneWeekBefore = now - (3600 * 24 * 7);
  const inOneWeek = now + (3600 * 24 * 7);
  
  try {
    const query = GET_POOLS.replace(/<TIMESTAMP_NOW>/g, now);
    const res = await request(GRAPH, query);
    
    let touchedTokens = res.pools.flatMap(pool => [pool.token0.id, pool.token1.id]);
    touchedTokens.push(config.solid); // Add SOLID due to emissions
    
    let processedPools = res.pools.map(pool => {
      // Process SOLID emissions
      const latestSolidEmission = pool.lpSolidEmissions
        .map(emission => ({
          period: parseInt(emission.period),
          amount: ethers.BigNumber.from(emission.amount)
        }))
        .filter(emission => emission.period > oneWeekBefore && emission.period < inOneWeek)
        .reduce(
          (max, current) => (current.period > max.period ? current : max),
          { period: 0, amount: ZERO }
        );
      
      pool.solid_per_year = latestSolidEmission.amount.mul(ethers.BigNumber.from(52));

      // Process token emissions (bribes)
      const currentIncentives = pool.lpTokenIncentives
        .map(incentive => ({
          periodStart: parseInt(incentive.periodStart),
          periodEnd: parseInt(incentive.periodEnd),
          amount: ethers.BigNumber.from(incentive.amount),
          token: incentive.token
        }))
        .filter(incentive => 
          incentive.periodStart < incentive.periodEnd && 
          incentive.periodStart < now && 
          incentive.periodEnd > now
        );

      pool.emissions_per_year = [];
      
      currentIncentives.forEach(emission => {
        touchedTokens.push(emission.token);
        
        const yearInSeconds = 3600 * 24 * 365;
        const emissionDuration = emission.periodEnd - emission.periodStart;
        
        pool.emissions_per_year.push({
          ...emission,
          per_year: emission.amount
            .mul(ethers.BigNumber.from(yearInSeconds))
            .div(ethers.BigNumber.from(emissionDuration))
        });
      });

      return pool;
    });

    // Filter out blacklisted pools
    if (config.blacklistedPools) {
      processedPools = processedPools.filter(pool => !config.blacklistedPools.includes(pool.id.toLowerCase()));
    }

    return {
      pools: processedPools,
      touched_tokens: [...new Set(touchedTokens)]
    };
  } catch (error) {
    console.error(`Error fetching pools for ${chain}:`, error);
    throw error;
  }
}

/**
 * Fetches prices for tokens
 * @param {string[]} tokenAddresses - Array of token addresses
 * @param {string} chain - Chain name
 * @returns {Promise<Object>} Token prices
 */
async function fetchPrices(tokenAddresses, chain) {
  try {
    // Deduplicate and lowercase all addresses
    const uniqueAddresses = [...new Set(tokenAddresses.map(addr => addr.toLowerCase()))];
    
    // Format tokens with chain prefix
    const tokenIds = uniqueAddresses.map(addr => `${chain}:${addr}`);
    
    // Chunk requests to avoid URL length limits
    const CHUNK_SIZE = 50;
    const chunks = [];
    
    for (let i = 0; i < tokenIds.length; i += CHUNK_SIZE) {
      chunks.push(tokenIds.slice(i, i + CHUNK_SIZE));
    }
    
    let allPrices = {};
    
    // Process each chunk
    await Promise.all(chunks.map(async (chunk) => {
      const addressString = chunk.join(',').replaceAll('/', '');
      
      if (addressString) {
        const response = await axios.get(`https://coins.llama.fi/prices/current/${addressString}`);
        Object.assign(allPrices, response.data.coins);
      }
    }));
    
    // Remove chain prefix from results
    const formattedPrices = {};
    Object.entries(allPrices).forEach(([key, value]) => {
      const address = key.split(':')[1].toLowerCase();
      formattedPrices[address] = value;
    });

    //make sure any missing prices are set to 0
    uniqueAddresses.forEach(address => {
      if (!formattedPrices[address]) {
        formattedPrices[address] = { price: 0, totalSupply: 0 };
      }
    });
    
    return formattedPrices;
  } catch (error) {
    console.error(`Error fetching prices:`, error);
    throw error;
  }
}

module.exports = {
  getGraphUrl,
  getSolid,
  bnToFloat,
  getBlock24hAgo,
  getPoolStateChanges,
  fetchPools,
  fetchPrices,
};