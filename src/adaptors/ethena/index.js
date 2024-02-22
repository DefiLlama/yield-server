const sdk = require('@defillama/sdk4');
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

  const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
  const toBlock = currentBlock.number;
  const secondsInWeek = 7 * 60 * 60 * 24;
  const timestampWeekAgo = currentBlock.timestamp - secondsInWeek;
  const [fromBlock] = await utils.getBlocksByTime(
    [timestampWeekAgo],
    'ethereum'
  );
  const topic =
    '0xbb28dd7cd6be6f61828ea9158a04c5182c716a946a6d2f31f4864edb87471aa6';
  const logs = (
    await sdk.api.util.getLogs({
      target: '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497',
      topic: '',
      toBlock,
      fromBlock,
      keys: [],
      topics: [topic],
      chain: 'ethereum',
    })
  ).output.sort((a, b) => b.blockNumber - a.blockNumber);
  const rewardsReceived = parseInt(logs[0].data) / 1e18;
  const tvlUsd = totalSupply * price;
  const aprBase = (rewardsReceived / tvlUsd) * 52 * 100;
  const apyBase = utils.aprToApy(aprBase, 52);
  return [
    {
      pool: sUSDe,
      symbol: 'sUSDe',
      project: 'ethena',
      chain: 'Ethereum',
      tvlUsd,
      apyBase,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.ethena.fi/',
};
