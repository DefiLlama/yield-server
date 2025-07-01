const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

// Reward tokens per chain (1st = stablecoin, 2nd = ZBU)
const REWARD_TOKENS = { 
    ethereum: ['0xdAC17F958D2ee523a2206206994597C13D831ec7', '0xe77f6aCD24185e149e329C1C0F479201b9Ec2f4B'], 
    base: ['0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', '0x2C8C89C442436CC6C0A77943E09C8DAF49DA3161'], 
    bsc: ['0x55d398326f99059ff775485246999027b3197955', '0x4D3dc895a9EDb234DfA3e303A196c009dC918f84'], 
};

// ZBU token addresses per chain
const ZBU = {
  ethereum: '0xe77f6aCD24185e149e329C1C0F479201b9Ec2f4B',
  base: '0x2C8C89C442436CC6C0A77943E09C8DAF49DA3161',
  bsc: '0x4D3dc895a9EDb234DfA3e303A196c009dC918f84',
};

// Reward Distributor contracts
const REWARD_DISTRIBUTORS = {
  ethereum: '0xE843115fF0Dc2b20f5b07b6E7Ba5fED064468AC6',
  base: '0x24a4f5afc6a87005f00770e7e66d4a3d134f9923',
  bsc: '0x8ae3D193a7Dfeb4c8e36211d21E729feCcfa738A',
};

// Voting Escrow contracts
const VOTING_ESCROW_ADDRESSES = {
  ethereum: '0x8e76Cdf3b14c540aB54aFa7f8492AC1d16Ecfb35',
  base: '0xcf08D1EC5d8e566D95299399307F75f98D6AEa03',
  bsc: '0xd3e8cD2eDbf252860E02ffb245fD654b1ab30f30',
};

// Chain-specific block numbers (for fetching logs)
const FROM_BLOCKS = {
  ethereum: 21324707,
  base: 23235100,
  bsc: 44561619,
};

// Decimals for stablecoins & ZBU
const DECIMALS = {
  ethereum: [6, 18], // USDT (6), ZBU (18)
  base: [6, 18],     // USDC (6), ZBU (18)
  bsc: [18, 18],     // BSC-USD (18), ZBU (18)
};

// Event topic for AddedRewardDistribution
const ADDED_REWARD_DISTRIBUTION_TOPIC = '0xf00943d3f835d7ca6986bc0202fbb734d3be564db0bad44bafccb5d41149302e';

const apy = async () => {
  console.log("Starting APY calculation...");
  const results = [];

  for (const chain of Object.keys(REWARD_DISTRIBUTORS)) {
    console.log(`Processing ${chain}...`);

    // Fetch total staked ZBU
    const totalStakedZBU = (
      await sdk.api.abi.call({
        target: ZBU[chain],
        abi: 'erc20:balanceOf',
        params: [VOTING_ESCROW_ADDRESSES[chain]], 
        chain,
      })
    ).output / 1e18; // ZBU has 18 decimals
    console.log(`Total Staked ZBU on ${chain}: `, totalStakedZBU, ` ZBU`);

    // Fetch prices for both reward tokens (stablecoin + ZBU)
    const tokenPrices = {};
    for (const token of REWARD_TOKENS[chain]) {
      const priceKey = `${chain}:${token}`;
      tokenPrices[token] = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
      ).data.coins[priceKey]?.price; 
    }
    console.log(`Token Prices for ${chain}: `, tokenPrices);

    // Calculate TVL in USD (using stablecoin price)
    const tvlUsd = totalStakedZBU * tokenPrices[REWARD_TOKENS[chain][1]];
    console.log(`TVL (USD) for ${chain}: $ `, tvlUsd);
    const currentBlock = await sdk.api.util.getLatestBlock(chain);
    const toBlock = currentBlock.number;
    // Fetch logs from RewardDistributor contract
    const logs = (
      await sdk.api.util.getLogs({
        target: REWARD_DISTRIBUTORS[chain],
        topic: '',
        toBlock,
        fromBlock: FROM_BLOCKS[chain],
        keys: [],
        topics: [ADDED_REWARD_DISTRIBUTION_TOPIC],
        chain,
      })
    ).output.sort((a, b) => b.blockNumber - a.blockNumber);
    // console.log(`Fetched Logs for ${chain}: `, logs);

    if (logs.length === 0) {
      console.log(`No reward distribution events found for ${chain}.`);
      continue;
    }

    // Decode and sum up rewards
    let totalRewardsUsd = 0;  

    for (const log of logs) {
      const dataHex = log.data;
      const amountHex = dataHex.slice(0, 66); // First 32 bytes -> Amount
      const timestampHex = dataHex.slice(66, 130); // Second 32 bytes -> Reward Timestamp

      const tokenAddress = `0x${log.topics[2].slice(-40)}`; // Extract token address
      console.log("Token Address: ", tokenAddress);
      const decimals = REWARD_TOKENS[chain][0].toLowerCase() === tokenAddress.toLowerCase() 
      ? DECIMALS[chain][0] // First token (Stablecoin)
      : DECIMALS[chain][1]; // Second token (ZBU)

      const amount = Number(BigInt(amountHex).toString()) / 10 ** decimals; 
      const rewardTimestamp = parseInt(timestampHex, 16);

      // Fetch token price
      let tokenPrice;
      if (REWARD_TOKENS[chain][0].toLowerCase() === tokenAddress.toLowerCase()) {
        // If it's a usd-pegged stablecoin, use $1
        tokenPrice = 1;
      } else {
        // If it's ZBU, use its actual price
        tokenPrice = tokenPrices[Object.keys(tokenPrices).find(
            key => key.toLowerCase() === tokenAddress.toLowerCase()
          )];
      }

      const rewardValueUsd = Number(amount) * tokenPrice;
      totalRewardsUsd += rewardValueUsd;

      console.log(`Token: ${tokenAddress} - Amount: ${amount} - Reward Value (in USD): ${rewardValueUsd} - Timestamp: ${rewardTimestamp}`);
    }

    console.log(`Total Rewards in USD for ${chain}: `, totalRewardsUsd);

    // APY Calculation
    const now = Math.floor(Date.now() / 1000);
    const firstLogTimestamp = parseInt(logs[logs.length - 1].data.slice(66, 130), 16);
    const daysSinceStart = (now - firstLogTimestamp) / 86400;

    if (daysSinceStart <= 0) {
      console.log(`Invalid daysSinceStart for ${chain}. Skipping APY calculation.`);
      continue;
    }

    const aprReward = (totalRewardsUsd * 365) / (tvlUsd * daysSinceStart) * 100;
    const apyReward = utils.aprToApy(aprReward, 52);

    console.log(`APR (Reward) for ${chain}: `, aprReward);
    console.log(`APY (Reward) for ${chain}: `, apyReward);

    results.push({
      pool: VOTING_ESCROW_ADDRESSES[chain],
      chain: chain.charAt(0).toUpperCase() + chain.slice(1),
      project: 'zeebu',
      symbol: 'ZBU',
      tvlUsd,
      apyReward,
      rewardTokens: REWARD_TOKENS[chain],
      underlyingTokens: [ZBU[chain]],
      poolMeta: 'Zeebu Staking Rewards',
      url: 'https://zeebu.fi/',
    });
  }

  return results;
};

module.exports = {
  apy
};
