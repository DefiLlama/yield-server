const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const USDe = '0x4c9edd5852cd905f086c759e8383e09bff1e68b3';
const sUSDe = '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: sUSDe,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const priceKey = `ethereum:${USDe}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * price;

  const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
  const toBlock = currentBlock.number;
  const topic =
    '0xbb28dd7cd6be6f61828ea9158a04c5182c716a946a6d2f31f4864edb87471aa6';
  const logs = (
    await sdk.api.util.getLogs({
      target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
      topic: '',
      toBlock,
      fromBlock: 19026137,
      keys: [],
      topics: [topic],
      chain: 'ethereum',
    })
  ).output.sort((a, b) => b.blockNumber - a.blockNumber);

  // rewards are now beeing streamed every 8hours, which we scale up to a year
  const rewardsReceived = parseInt(logs[0].data / 1e18);
  const aprBase = ((rewardsReceived * 3 * 365) / tvlUsd) * 100;
  // weekly compoounding
  const apyBase = utils.aprToApy(aprBase, 52);
  return [
    {
      pool: sUSDe,
      symbol: 'sUSDe',
      project: 'ethena',
      chain: 'Ethereum',
      tvlUsd,
      apyBase,
      poolMeta: '7 days unstaking',
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.ethena.fi/',
};
