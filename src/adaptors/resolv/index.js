const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');

// RLP Constants
const RLP = '0x4956b52aE2fF65D74CA2d61207523288e4528f96';
const rlpPriceStorage = '0xaE2364579D6cB4Bbd6695846C1D595cA9AF3574d';
const topic0priceSet =
  '0x2f0fe01aa6daff1c7bb411a324bdebe55dc2cd1e0ff2fc504b7569346e7d7d5a';
const priceSetInterface = new ethers.utils.Interface([
  'event PriceSet(bytes32 indexed key, uint256 price, uint256 timestamp);',
]);

// stUSR Constants
const stUSR = '0x6c8984bc7DBBeDAf4F6b2FD766f16eBB7d10AAb4';
const USR = '0x66a1E37c9b0eAddca17d3662D6c05F4DECf3e110';
const rewardDistributor = '0x9F805FC8679e5F81a0683c3203ad48417efDAd12';
const topic0rewardDistributed =
  '0x8e97a7864cd6b584c022565df813008122c26e4c7e76117b80268b24c60c8c82';
const rewardDistributedInterface = new ethers.utils.Interface([
  'event RewardAllocated(bytes32 indexed _idempotencyKey, uint256 _totalShares, uint256 _totalUSRBefore, uint256 _totalUSRAfter, uint256 _stakingReward, uint256 _feeReward)',
]);

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const getTotalSupply = async (tokenAddress, chain = 'ethereum') => {
  try {
    const { output } = await sdk.api.abi.call({
      target: tokenAddress,
      abi: 'erc20:totalSupply',
      chain,
    });
    return output / 1e18;
  } catch (error) {
    console.error(`Error fetching total supply for ${tokenAddress}:`, error);
    throw error;
  }
};

const getTokenPrice = async (tokenAddress) => {
  try {
    const priceKey = `ethereum:${tokenAddress}`;
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${priceKey}`
    );
    return data.coins[priceKey].price;
  } catch (error) {
    console.error(`Error fetching price for ${tokenAddress}:`, error);
    throw error;
  }
};

const calculateStUSRApy = (logDescription) => {
  const { _totalUSRBefore, _totalUSRAfter, _totalShares } = logDescription.args;
  const sharesRateBefore = _totalUSRBefore / _totalShares;
  const sharesRateAfter = _totalUSRAfter / _totalShares;
  return ((sharesRateAfter - sharesRateBefore) / sharesRateBefore) * 365;
};

const rlpPool = async () => {
  try {
    const totalSupply = await getTotalSupply(RLP);
    const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
    const currentDate = new Date(currentBlock.timestamp * 1000);
    const previousStartOfDay =
      new Date(currentDate).setHours(0, 0, 0, 0) - 2 * DAY_IN_MS;

    const [fromBlock] = await utils.getBlocksByTime(
      [previousStartOfDay / 1000],
      'ethereum'
    );
    const toBlock = currentBlock.block;

    const logs = (
      await sdk.api.util.getLogs({
        target: rlpPriceStorage,
        topic: '',
        fromBlock,
        toBlock,
        keys: [],
        chain: 'ethereum',
        topics: [topic0priceSet],
      })
    ).output.sort((a, b) => a.blockNumber - b.blockNumber);

    let aprBase = 0;
    if (logs.length >= 2) {
      const lastLpPrice = priceSetInterface.parseLog(logs[logs.length - 1]).args
        .price;
      const previousLpPrice = priceSetInterface.parseLog(logs[logs.length - 2])
        .args.price;

      aprBase = ((lastLpPrice - previousLpPrice) / previousLpPrice) * 365;
    }

    const price =
      logs.length > 0
        ? priceSetInterface.parseLog(logs[logs.length - 1]).args.price / 1e18
        : await getTokenPrice(RLP);
    const tvl = totalSupply * price;

    return {
      pool: RLP,
      symbol: 'RLP',
      chain: 'ethereum',
      project: 'resolv',
      tvlUsd: tvl,
      apyBase: aprBase * 100,
    };
  } catch (error) {
    console.error('Error fetching RLP pool data:', error);
    throw error;
  }
};

const stUsrPool = async () => {
  try {
    const totalSupply = await getTotalSupply(stUSR);
    const price = await getTokenPrice(USR);
    const tvl = totalSupply * price;

    const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
    const currentDate = new Date(currentBlock.timestamp * 1000);
    const previousStartOfDay =
      new Date(currentDate).setHours(0, 0, 0, 0) - DAY_IN_MS;

    const [fromBlock] = await utils.getBlocksByTime(
      [previousStartOfDay / 1000],
      'ethereum'
    );
    const toBlock = currentBlock.block;

    const logs = (
      await sdk.api.util.getLogs({
        target: rewardDistributor,
        topic: '',
        fromBlock,
        toBlock,
        keys: [],
        chain: 'ethereum',
        topics: [topic0rewardDistributed],
      })
    ).output.sort((a, b) => a.blockNumber - b.blockNumber);

    let aprBase = 0;
    if (logs.length > 0) {
      const parsedLog = rewardDistributedInterface.parseLog(
        logs[logs.length - 1]
      );
      aprBase = calculateStUSRApy(parsedLog);
    }

    return {
      pool: stUSR,
      symbol: 'stUSR',
      chain: 'ethereum',
      project: 'resolv',
      tvlUsd: tvl,
      apyBase: aprBase * 100,
    };
  } catch (error) {
    console.error('Error fetching stUSR pool data:', error);
    throw error;
  }
};

const apy = async () => {
  try {
    return [await rlpPool(), await stUsrPool()];
  } catch (error) {
    console.error('Error fetching APYs:', error);
    throw error;
  }
};

module.exports = {
  apy,
  url: 'https://www.resolv.xyz/',
};
