const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const sUSDe = '0x9D39A5DE30e57443BfF2A8307A4256c8797A3497';
const USDe = '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3';

const EVENTS = {
  RewardsReceived: 'event RewardsReceived(uint256 amount)',
};

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: sUSDe,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const priceKey = `ethereum:${sUSDe}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const tvlUsd = totalSupply * price;

  const currentBlock = await sdk.api.util.getLatestBlock('ethereum');
  const toBlock = currentBlock.number;
  const logs = (
    await sdk.getEventLogs({
      target: sUSDe,
      eventAbi: EVENTS.RewardsReceived,
      fromBlock: 19026137,
      toBlock,
      chain: 'ethereum',
    })
  ).sort((a, b) => b.blockNumber - a.blockNumber);

  // rewards are now beeing streamed every 8hours, which we scale up to a year
  const rewardsReceived = Number(logs[0].args.amount) / 1e18;

  const aprBase = ((rewardsReceived * 3 * 365) / tvlUsd) * 100;
  // weekly compoounding
  const apyBase = utils.aprToApy(aprBase, 52);
  return [
    {
      pool: sUSDe,
      symbol: 'sUSDe',
      project: 'ethena-usde',
      chain: 'Ethereum',
      tvlUsd,
      apyBase,
      poolMeta: '7 days unstaking',
      underlyingTokens: [USDe],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.ethena.fi/',
};
