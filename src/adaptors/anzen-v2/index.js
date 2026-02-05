const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const USDz = '0xA469B7Ee9ee773642b3e93E842e5D9b5BaA10067';
const sUSDz = '0x547213367cfb08ab418e7b54d7883b2c2aa27fd7';

const EVENTS = {
  YieldReceived: 'event YieldReceived(uint256 indexed amount)',
};

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: sUSDz,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const priceKey = `ethereum:${USDz}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * price;

  const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
  const toBlock = currentBlock.number;
  const logs = (
    await sdk.getEventLogs({
      target: sUSDz,
      eventAbi: EVENTS.YieldReceived,
      fromBlock: 19881601,
      toBlock,
      chain: 'ethereum',
    })
  ).sort((a, b) => b.blockNumber - a.blockNumber);

  let apyBase = 0;
  if (logs && logs.length > 0) {
    // rewards are now being streamed every week, which we scale up to a year
    const rewardsReceived = Number(logs[0].args.amount) / 1e18;
    const aprBase = ((rewardsReceived * 365 / 7) / tvlUsd) * 100;
    // weekly compoounding
    apyBase = utils.aprToApy(aprBase, 52);
  }
  return [
    {
      pool: sUSDz,
      symbol: 'sUSDz',
      project: 'anzen-v2',
      chain: 'Ethereum',
      tvlUsd,
      apyBase,
      poolMeta: '7 days unstaking',
      underlyingTokens: [USDz],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://anzen.finance/',
};