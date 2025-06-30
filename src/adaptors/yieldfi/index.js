const utils = require('../utils');
const { ethers } = require("ethers");
const sdk = require('@defillama/sdk');

// Constants
const CHAIN = 'ethereum';
const BLOCKS_TO_CHECK = 30000;
const DECIMALS = {
  yUSD: 18,
  vyUSD: 18,
  yield: 6
};

// Contract addresses
const CONTRACTS = {
  distribution: "0x392017161a9507F19644E8886A237C58809212B5",
  yUSD: "0x19Ebd191f7A24ECE672ba13A302212b5eF7F35cb",
  vyUSD: "0x2e3C5e514EEf46727DE1FE44618027A9b70D92FC"
};

// ABIs
const ABIS = {
  distribution: [
    "event DistributeYield(address caller, address indexed asset, address indexed receiver, uint256 amount, bool profit)"
  ],
  totalSupply: 'function totalSupply() view returns (uint256)'
};

/**
 * Find the latest yield distribution log for a specific receiver
 * @param {Array} logs - Array of event logs
 * @param {Object} iface - Ethers interface instance
 * @param {string} receiver - Receiver address to filter by
 * @returns {Object|null} Latest log and parsed data or null if not found
 */
const getLatestYieldLog = (logs, iface, receiver) => {
  for (let i = logs.length - 1; i >= 0; i--) {
    const parsed = iface.parseLog(logs[i]);
    if (parsed.args.receiver.toLowerCase() === receiver.toLowerCase()) {
      return { log: logs[i], parsed };
    }
  }
  return null;
};

/**
 * Calculate APY based on TVL and yield amount
 * @param {number} tvl - Total Value Locked
 * @param {number} yieldAmount - Yield amount distributed
 * @returns {number} Annual Percentage Yield
 */
const calculateAPY = (tvl, yieldAmount) => {
  if (tvl <= 0) return 0;
  const growthFactor = (tvl + yieldAmount) / tvl;
  const apy = ((growthFactor ** 365) - 1) * 100;
  return parseFloat(apy.toFixed(2));
};

/**
 * Get TVL for a specific token at a given block
 * @param {string} tokenAddress - Token contract address
 * @param {number} blockNumber - Block number to query
 * @returns {Promise<number>} TVL value
 */
const getTVL = async (tokenAddress, blockNumber) => {
  try {
    const response = await sdk.api.abi.call({
      chain: CHAIN,
      abi: ABIS.totalSupply,
      target: tokenAddress,
      block: blockNumber
    });
    return parseFloat((response.output / 10 ** DECIMALS.yUSD).toFixed(2));
  } catch (error) {
    console.error(`Error getting TVL for ${tokenAddress}:`, error);
    return 0;
  }
};

/**
 * Create pool object for a token
 * @param {string} tokenAddress - Token contract address
 * @param {string} symbol - Token symbol
 * @param {number} tvl - Total Value Locked
 * @param {number} apy - Annual Percentage Yield
 * @returns {Object} Pool object
 */
const createPool = (tokenAddress, symbol, tvl, apy) => ({
  pool: tokenAddress,
  chain: CHAIN,
  project: 'yieldfi',
  symbol: utils.formatSymbol(symbol),
  tvlUsd: tvl,
  apyBase: apy,
});

/**
 * Process yield data for a specific token
 * @param {Array} logs - Array of event logs
 * @param {Object} iface - Ethers interface instance
 * @param {string} tokenAddress - Token contract address
 * @param {string} symbol - Token symbol
 * @returns {Promise<Object|null>} Pool object or null if no yield data
 */
const processTokenYield = async (logs, iface, tokenAddress, symbol) => {
  const yieldData = getLatestYieldLog(logs, iface, tokenAddress);
  
  if (!yieldData) {
    console.log(`No yield data found for ${symbol}`);
    return null;
  }

  const block = yieldData.log.blockNumber;
  const tvl = await getTVL(tokenAddress, block);
  const yieldAmount = parseFloat(yieldData.parsed.args.amount / 10 ** DECIMALS.yield);
  
  // console.log(`${symbol} yieldAmount:`, yieldAmount);
  
  const apy = calculateAPY(tvl, yieldAmount);
  
  return createPool(tokenAddress, symbol, tvl, apy);
};

/**
 * Main function to get pool data
 * @returns {Promise<Array>} Array of pool objects
 */
const poolsFunction = async () => {
  try {
    // Get latest block
    const latestBlockResp = await sdk.api.util.getLatestBlock(CHAIN);
    const latestBlock = latestBlockResp.number;
    const fromBlock = Math.max(latestBlock - BLOCKS_TO_CHECK, 0);

    // Create interface for parsing logs
    const iface = new ethers.utils.Interface(ABIS.distribution);

    // Fetch yield distribution logs
    const logsResponse = await sdk.api.util.getLogs({
      target: CONTRACTS.distribution,
      topic: '',
      fromBlock,
      toBlock: latestBlock,
      topics: [iface.getEventTopic('DistributeYield')],
      keys: [],
      chain: CHAIN,
    });

    const logs = logsResponse.output.filter(ev => !ev.removed);
    // console.log(`Found ${logs.length} yield distribution logs`);

    // Process both tokens
    const [yusdPool, vyusdPool] = await Promise.all([
      processTokenYield(logs, iface, CONTRACTS.yUSD, 'yUSD'),
      processTokenYield(logs, iface, CONTRACTS.vyUSD, 'vyUSD')
    ]);

    return [yusdPool, vyusdPool].filter(Boolean);
  } catch (error) {
    console.error('Error in poolsFunction:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.fi/mint',
};
