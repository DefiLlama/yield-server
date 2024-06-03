const axios = require('axios');

const sdk = require('@defillama/sdk');

const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const SNX = '0x22e6966B799c4D5B13BE962E1D117b56327FDa66';
const USDC_POOL = '0x32C222A9A159782aFD7529c87FA34b96CA72C696';

const apy = async () => {
  const apr = (await axios.get('https://api.synthetix.io/v3/base/sc-pool-apy'))
    .data;

  const deposits =
    (
      await sdk.api.abi.call({
        target: USDC,
        abi: 'erc20:balanceOf',
        chain: 'base',
        params: [USDC_POOL],
      })
    ).output / 1e6;

  const key = `base:${USDC}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${key}`)
  ).data.coins[key].price;

  return [
    {
      pool: USDC_POOL,
      symbol: 'USDC',
      project: 'synthetix-v3',
      chain: 'Base',
      tvlUsd: deposits * price,
      apyBase: apr.aprPnl * 100,
      apyReward: apr.aprRewards * 100,
      rewardTokens: [USDC, SNX],
      underlyingTokens: [USDC],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://liquidity.synthetix.eth.limo/',
};
