const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const USDz = '0xA469B7Ee9ee773642b3e93E842e5D9b5BaA10067';
const sUSDz = '0x547213367cfb08ab418e7b54d7883b2c2aa27fd7';

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
  const topic =
    '0xd0e841f234010ad7f57b7c09faffb2245cd240429c6e8fa3cd934a0a8bf58eb0';
  const logs = (
    await sdk.api.util.getLogs({
      target: '0x547213367cfb08ab418e7b54d7883b2c2aa27fd7',
      topic: '',
      toBlock,
      fromBlock: 19881601,
      keys: [],
      topics: [topic],
      chain: 'ethereum',
    })
  ).output.sort((a, b) => b.blockNumber - a.blockNumber);

  console.log(logs[0]);
  // rewards are now beeing streamed every week, which we scale up to a year
  const rewardsReceived = parseInt(logs[0].topics[1] / 1e18);
  const aprBase = ((rewardsReceived * 365 / 7) / tvlUsd) * 100;
  // weekly compoounding
  const apyBase = utils.aprToApy(aprBase, 52);
  return [
    {
      pool: sUSDz,
      symbol: 'sUSDz',
      project: 'anzen-v2',
      chain: 'Ethereum',
      tvlUsd,
      apyBase,
      poolMeta: '7 days unstaking',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://anzen.finance/',
};