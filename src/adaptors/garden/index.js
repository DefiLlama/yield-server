const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const { ethers } = require('ethers');

const GARDEN_STAKING_CONTRACT = '0xe2239938Ce088148b3Ab398b2b77Eedfcd9d1AfC';
const SEED_TOKEN = '0x86f65121804D2Cdbef79F9f072D4e0c2eEbABC08';
const chain = 'arbitrum';

const EVENTS = {
  Staked:
    'event Staked(bytes32 indexed stakeID, address indexed owner, uint256 stake, uint256 expiry)',
  StakeRefunded: 'event StakeRefunded(bytes32 indexed stakeID)',
};

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
      const stakedLogs = await sdk.getEventLogs({
        target: GARDEN_STAKING_CONTRACT,
        eventAbi: EVENTS.Staked,
        fromBlock,
        toBlock,
        chain,
      });

      // Fetch StakeRefunded events
      const refundedLogs = await sdk.getEventLogs({
        target: GARDEN_STAKING_CONTRACT,
        eventAbi: EVENTS.StakeRefunded,
        fromBlock,
        toBlock,
        chain,
      });

      return { stakedLogs, refundedLogs, currentBlock: currentBlock.number };
    } catch (error) {
      console.error('Error fetching events:', error);
      throw error;
    }
  }

  async processEvents(stakedLogs, refundedLogs) {
    try {
      const refundedStakeIDs = new Set(); // Track refunded stake IDs

      // Process staked events first (logs are already parsed)
      for (const log of stakedLogs) {
        try {
          const stakeID = log.args.stakeID;
          const stakeAmount = log.args.stake;
          const owner = log.args.owner;
          const expiry = log.args.expiry;

          this.stakes.set(stakeID, {
            amount: stakeAmount.toString(),
            owner: owner,
            expiry: expiry.toString(),
            blockNumber: log.blockNumber,
            transactionHash: log.transactionHash,
          });
        } catch (error) {
          console.warn('Failed to process staked event:', error.message);
        }
      }

      // Process refunded events to remove stakes (logs are already parsed)
      for (const log of refundedLogs) {
        try {
          const stakeID = log.args.stakeID;

          refundedStakeIDs.add(stakeID);
          this.stakes.delete(stakeID);
        } catch (error) {
          console.warn('Failed to process refunded event:', error.message);
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

    const seedPrice =
      priceData.data.coins[`${chain}:${SEED_TOKEN}`]?.price || 0;

    // Calculate TVL in USD
    const tvlUsd = tvl * seedPrice;

    return [
      {
        pool: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf-base',
        chain: utils.formatChain(chain),
        project: 'garden',
        symbol: utils.formatSymbol('SEED'),
        tvlUsd: tvlUsd,
        apy: apyData.data,
        underlyingTokens: [SEED_TOKEN],
      },
    ];
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
