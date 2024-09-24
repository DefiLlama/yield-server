const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');

const stUSR = '0x6c8984bc7DBBeDAf4F6b2FD766f16eBB7d10AAb4';
const USR = '0x66a1E37c9b0eAddca17d3662D6c05F4DECf3e110';

const rewardDistributor = '0xbE23BB6D817C08E7EC4Cd0adB0E23156189c1bA9';
const topic0rewardDistributed = '0x3863fc447b7dde3f3f5a5ca0b5b06a5fd3570963a1a29918f09036746293f658';
const rewardDistributedInterface = new ethers.utils.Interface(['event RewardDistributed(bytes32 indexed idempotencyKey, uint256 totalShares, uint256 totalUSRBefore, uint256 totalUSRAfter, uint256 stakingReward, uint256 feeReward)']);

const apy = async () => {
  const totalSupply = (
    await sdk.api.abi.call({
      target: stUSR,
      abi: 'erc20:totalSupply',
      chain: 'ethereum'
    })
  ).output / 1e18;

  const priceKey = `ethereum:${USR}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvl = totalSupply * price;

  const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
  const currentDate = new Date(currentBlock.timestamp * 1000);
  const startOfDay = new Date(currentDate).setHours(0, 0, 0, 0);

  const [fromBlock] = await utils.getBlocksByTime([startOfDay / 1000], 'ethereum');
  const toBlock = currentBlock.block;
  const logs = (
    await sdk.api.util.getLogs({
      target: rewardDistributor,
      topic: '',
      toBlock: toBlock,
      fromBlock: fromBlock,
      keys: [],
      chain: 'ethereum',
      topics: [topic0rewardDistributed]
    })
  ).output.sort((a, b) => b.blockNumber - a.blockNumber);

  let aprBase = 0;
  if (logs.length > 0) {
    const log = logs[logs.length - 1];
    const lastLog = rewardDistributedInterface.parseLog(log);
    const totalUsrBefore = lastLog.args.totalUSRBefore;
    const totalUsrAfter = lastLog.args.totalUSRAfter;
    const totalShares = lastLog.args.totalShares;
    const sharesRateBefore = totalUsrBefore / totalShares;
    const sharesRateAfter = totalUsrAfter / totalShares;
    aprBase = ((sharesRateAfter - sharesRateBefore) / sharesRateBefore) * 365;
  }

  return [{
    pool: stUSR,
    symbol: 'stUSR',
    chain: 'ethereum',
    project: 'resolv',
    tvlUsd: tvl,
    apyBase: aprBase * 100
  }];
};

module.exports = {
  apy,
  url: 'https://www.resolv.xyz/'
};
