const sdk = require('@defillama/sdk');
const axios = require('axios');

const token = '0x5bBe36152d3CD3eB7183A82470b39b29EedF068B';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const getApy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: token })).output / 1e18;

  const apyData = (
    await axios.get('https://api.hord.app/validators/stats/latest')
  ).data.stats;
  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'hord',
      symbol: 'heth',
      tvlUsd: (tvl / apyData.heth_to_eth) * ethPrice,
      apyBase: apyData.eth_staking_apy,
      apyReward: apyData.hord_staking_apy,
      rewardTokens: ['0x43a96962254855f16b925556f9e97be436a43448'],
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.hord.fi/',
};
