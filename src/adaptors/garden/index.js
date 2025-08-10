const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { ethers } = require('ethers');

const GARDEN_STAKING_CONTRACT = '0xe2239938Ce088148b3Ab398b2b77Eedfcd9d1AfC'
const SEED_TOKEN = '0x86f65121804D2Cdbef79F9f072D4e0c2eEbABC08'
const chain = 'arbitrum'

// Event topics for staking events
const STAKED_EVENT_TOPIC = '0xa1fdccfe567643a44425efdd141171e8d992854a81e5c819c1432b0de47c9a11';
const STAKE_REFUNDED_EVENT_TOPIC = '0xba33cc6a4502f7f80bfe643ffa925ba7ab5e0af61c061a9aceabef0349c9dce4';
const MAX_UINT256 = ethers.constants.MaxUint256;

// ABI for the events we need
const eventAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "stakeID",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "owner",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "stake",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "expiry",
        "type": "uint256"
      }
    ],
    "name": "Staked",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "bytes32",
        "name": "stakeID",
        "type": "bytes32"
      }
    ],
    "name": "StakeRefunded",
    "type": "event"
  },
];

// TVL Calculator class (simplified for adapter use)
class TVLCalculator {
  constructor() {
    this.stakes = new Map(); // stakeID -> stake amount
  }

  async fetchEvents() {

    try {
      // Get current block number
      const currentBlock = await sdk.api.util.getLatestBlock(chain);
      const toBlock = currentBlock.number;
      const fromBlock = 192080606; // Contract deployment block

      // Fetch Staked events
      const stakedLogs = (
        await sdk.api.util.getLogs({
          target: GARDEN_STAKING_CONTRACT,
          topic: '',
          toBlock,
          fromBlock,
          keys: [],
          topics: [STAKED_EVENT_TOPIC],
          chain: chain,
        })
      ).output;

      // Fetch StakeRefunded events
      const refundedLogs = (
        await sdk.api.util.getLogs({
          target: GARDEN_STAKING_CONTRACT,
          topic: '',
          toBlock,
          fromBlock,
          keys: [],
          topics: [STAKE_REFUNDED_EVENT_TOPIC],
          chain: chain,
        })
      ).output;

      return { stakedLogs, refundedLogs, currentBlock: currentBlock.number };

    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  }

  async processEvents(stakedLogs, refundedLogs) {

    try {

      const abiInterface = new ethers.utils.Interface(eventAbi);
      const refundedStakeIDs = new Set(); // Track refunded stake IDs

      // Process staked events first
      for (const log of stakedLogs) {
        try {
          const formattedLog = {
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: typeof log.blockNumber === 'string' ? parseInt(log.blockNumber, 16) : log.blockNumber,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex
          };

          const decoded = abiInterface.parseLog(formattedLog);
          const stakeID = decoded.args.stakeID;
          const stakeAmount = decoded.args.stake;
          const owner = decoded.args.owner;
          const expiry = decoded.args.expiry;

          this.stakes.set(stakeID, {
            amount: stakeAmount.toString(),
            owner: owner,
            expiry: expiry.toString(),
            blockNumber: formattedLog.blockNumber,
            transactionHash: log.transactionHash
          });

        } catch (error) {
          console.warn('Failed to decode staked event:', error.message);
        }
      }

      // Process refunded events to remove stakes
      for (const log of refundedLogs) {
        try {
          const formattedLog = {
            address: log.address,
            topics: log.topics,
            data: log.data,
            blockNumber: typeof log.blockNumber === 'string' ? parseInt(log.blockNumber, 16) : log.blockNumber,
            transactionHash: log.transactionHash,
            logIndex: log.logIndex
          };

          const decoded = abiInterface.parseLog(formattedLog);
          const stakeID = decoded.args.stakeID;

          refundedStakeIDs.add(stakeID);
          this.stakes.delete(stakeID);

        } catch (error) {
          console.warn('Failed to decode refunded event:', error.message);
        }
      }

    } catch (error) {
      console.error('Error processing events:', error);
      throw error;
    }
  }

  calculateTVL() {
    try {
      let totalTVLWei = BigInt(0);

      for (const [stakeID, stakeInfo] of this.stakes.entries()) {
        totalTVLWei += BigInt(stakeInfo.amount);
      }

      const totalTVLEther = ethers.utils.formatEther(totalTVLWei);

      return {
        tvl: totalTVLEther,
      };

    } catch (error) {
      console.error('Error calculating TVL:', error);
      throw error;
    }
  }
}

const getTvl = async () => {
  try {
    // Get APY data
    const apyData = await utils.getData('https://stakingv2.garden.finance/apy');

    // Calculate TVL using event-based method
    const calculator = new TVLCalculator();

    // Fetch and process events
    const { stakedLogs, refundedLogs } = await calculator.fetchEvents();
    await calculator.processEvents(stakedLogs, refundedLogs);

    // Calculate TVL from events
    const tvlResult = calculator.calculateTVL();
    const tvl = parseFloat(tvlResult.tvl);


    // Get SEED price
    const priceData = await axios.get(
      'https://coins.llama.fi/prices/current/arbitrum:0x86f65121804D2Cdbef79F9f072D4e0c2eEbABC08'
    );

    const seedPrice = priceData.data.coins[`${chain}:${SEED_TOKEN}`]?.price || 0;

    // Calculate TVL in USD
    const tvlUsd = tvl * seedPrice;

    return [{
      pool: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf-base',
      chain: utils.formatChain(chain),
      project: 'garden',
      symbol: utils.formatSymbol('SEED'),
      tvlUsd: tvlUsd,
      apy: apyData.data,
    }];

  } catch (error) {
    console.error('Error in getTvl:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getTvl,
  url: 'https://app.garden.finance/stake',
};