const sdk = require('@defillama/sdk');
const basicDataFeedAbi = require('./abi/basicDatafeedAbi.json');
const utils = require('../utils');

const SECONDS_PER_DAY = 86400;

// Get aggregator address from data feed contract
async function getAggregatorAddress(dataFeedAddress, chain) {
  try {
    const result = await sdk.api.abi.call({
      target: dataFeedAddress,
      abi: 'function aggregator() view returns (address)',
      chain: chain,
    });

    return result.output;
  } catch (error) {
    console.warn(
      `MidasRWA: Failed to get aggregator address for ${dataFeedAddress} on ${chain}:`,
      error.message
    );
    return null;
  }
}

// Get latest round data from aggregator
async function getLatestRound(aggregatorAddress, chain) {
  const result = await sdk.api.abi.call({
    target: aggregatorAddress,
    abi: basicDataFeedAbi.find((m) => m.name === 'latestRoundData'),
    chain: chain,
  });

  if (!result.output) {
    return null;
  }

  const [roundId, answer, , updatedAt] = result.output;
  return {
    roundId: Number(roundId),
    answer: BigInt(answer),
    updatedAt: Number(updatedAt),
  };
}

// Get round data at specific block
async function getRoundAtBlock(aggregatorAddress, chain, block) {
  const result = await sdk.api.abi.call({
    target: aggregatorAddress,
    abi: basicDataFeedAbi.find((m) => m.name === 'latestRoundData'),
    chain: chain,
    block: block,
  });

  if (!result.output) {
    return null;
  }

  const [roundId, answer, , updatedAt] = result.output;
  return {
    roundId: Number(roundId),
    answer: BigInt(answer),
    updatedAt: Number(updatedAt),
  };
}

// Get specific round by ID
async function getRoundById(aggregatorAddress, chain, roundId) {
  const result = await sdk.api.abi.call({
    target: aggregatorAddress,
    abi: basicDataFeedAbi.find((m) => m.name === 'getRoundData'),
    chain: chain,
    params: [roundId],
  });

  if (!result.output) {
    return null;
  }

  const [, answer, , updatedAt] = result.output;
  return {
    answer: BigInt(answer),
    updatedAt: Number(updatedAt),
  };
}

// Get historical price data with fallback
async function getHistoricalPrice(aggregatorAddress, chain, latestRound) {
  const historicalTimestamp = latestRound.updatedAt - 6 * SECONDS_PER_DAY;
  const [historicalBlock] = await utils.getBlocksByTime(
    [historicalTimestamp],
    chain
  );

  try {
    const historicalData = await getRoundAtBlock(
      aggregatorAddress,
      chain,
      historicalBlock
    );

    if (!historicalData) {
      console.warn(
        `MidasRWA: No historical price data available at block ${historicalBlock} for ${aggregatorAddress}`
      );
      return null;
    }

    // If same roundId, try previous round
    if (historicalData.roundId === latestRound.roundId) {
      console.warn(
        `MidasRWA: Same roundId (${historicalData.roundId}) at historical block, trying previous round`
      );

      const previousRoundId = latestRound.roundId - 1;
      const previousRound = await getRoundById(
        aggregatorAddress,
        chain,
        previousRoundId
      );

      if (!previousRound) {
        console.warn(
          `MidasRWA: No previous round data available for round ${previousRoundId}`
        );
        return null;
      }

      return previousRound;
    }

    return historicalData;
  } catch (error) {
    console.warn(
      `MidasRWA: Failed to fetch historical price data at block ${historicalBlock} for ${aggregatorAddress}:`,
      error.message
    );
    return null;
  }
}

// Get latest and historical price data for APY calculation
async function getPriceData(aggregatorAddress, chain) {
  try {
    const latestRound = await getLatestRound(aggregatorAddress, chain);

    if (!latestRound) {
      return null;
    }

    // Skip if only first round available
    if (latestRound.roundId === 1) {
      console.warn(
        `MidasRWA: Skipping ${aggregatorAddress} - only first round available (roundId: 1), no historical data`
      );
      return null;
    }

    const historicalRound = await getHistoricalPrice(
      aggregatorAddress,
      chain,
      latestRound
    );

    if (!historicalRound) {
      return null;
    }

    return {
      latest: latestRound,
      historical: historicalRound,
    };
  } catch (error) {
    console.warn(
      `MidasRWA: Failed to fetch price data for ${aggregatorAddress}:`,
      error.message
    );
    return null;
  }
}

module.exports = {
  getAggregatorAddress,
  getPriceData,
};
