const { parse } = require('date-fns');
const utils = require('../utils');
const { ethers } = require("ethers");
const { poll } = require('ethers/lib/utils');
const sdk = require('@defillama/sdk');

// 2) Addresses and ABIs
const distributionAddress = "0xf4eF3ba63593dfD0967577B2bb3C9ba51D78427b";
const distributionABI = [
  "event DistributeYield(address indexed asset, address indexed receiver, uint256 amount, bool profit)"
];

const sUsdAddress = "0x4F8E1426A9d10bddc11d26042ad270F16cCb95F2";
const sUsdABI = 'function totalSupply() view returns (uint256)';

// 3) Create contract objects

const poolsFunction = async () => {
  const latestBlockResp = await sdk.api.util.getLatestBlock("ethereum");
  const latestBlock = latestBlockResp.number;

  const numBlocksToCheck = 30000;
  const fromBlock = Math.max(latestBlock - numBlocksToCheck, 0);
  const iface = new ethers.utils.Interface(distributionABI);

  let logs  = (await sdk.api.util.getLogs({
    target: distributionAddress,
    topic: '',
    fromBlock: fromBlock,
    toBlock: latestBlock,
    topics: [iface.getEventTopic('DistributeYield')],
    keys: [],
    chain: 'ethereum',
  })).output
  .filter((ev) => !ev.removed)

  const lastLog = logs[logs.length - 1];
  const eventBlockNumber = lastLog.blockNumber;

  const  {output} = await sdk.api.abi.call({
    chain: "ethereum",
    abi: sUsdABI,
    target: sUsdAddress,
    block: eventBlockNumber
  });
  const tvl = parseFloat((output/1e18).toFixed(2));
  const yieldAmount = parseFloat(iface.parseLog(lastLog).args.amount/1e18);
  const apy = ((((tvl+yieldAmount)/tvl)**365-1)*100).toFixed(2);

  const yusdPool = {
    pool: '0x1CE7D9942ff78c328A4181b9F3826fEE6D845A97',
    chain: 'ethereum',
    project: 'yieldfi',
    symbol: utils.formatSymbol('yUSD'),
    tvlUsd: tvl,
    apy: parseFloat(apy),
  };

  return [yusdPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.fi/mint',
};

poolsFunction()
