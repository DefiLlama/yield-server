const { parse } = require('date-fns');
const utils = require('../utils');
const { ethers } = require("ethers");
const { poll } = require('ethers/lib/utils');
const sdk = require('@defillama/sdk');

// 2) Addresses and ABIs
const distributionAddress = "0x392017161a9507F19644E8886A237C58809212B5";
const distributionABI = [
  "event DistributeYield(address caller, address indexed asset, address indexed receiver, uint256 amount, bool profit)"
];

const yUSDAddress = "0x19Ebd191f7A24ECE672ba13A302212b5eF7F35cb";
const yUSDABI = 'function totalSupply() view returns (uint256)';

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
    abi: yUSDABI,
    target: yUSDAddress,
    block: eventBlockNumber
  });
  const tvl = parseFloat((output/1e18).toFixed(2));
  const yieldAmount = parseFloat(iface.parseLog(lastLog).args.amount/1e6);
  const apy = ((((tvl+yieldAmount)/tvl)**365-1)*100).toFixed(2);

  const yusdPool = {
    pool: '0x19Ebd191f7A24ECE672ba13A302212b5eF7F35cb',
    chain: 'ethereum',
    project: 'yieldfi',
    symbol: utils.formatSymbol('yUSD'),
    tvlUsd: tvl,
    apyBase: parseFloat(apy),
  };

  return [yusdPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.fi/mint',
};

poolsFunction()
