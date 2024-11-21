const sdk = require('@defillama/sdk');
const axios = require('axios');

const weETH = '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const eigen = '0xec53bf9167f50cdeb3ae105f56099aaab9061f83';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: weETH,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const block7dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp7dayAgo}`)
  ).data.height;

  const abi = 'function getRate() external view returns (uint256)';

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: weETH,
      abi: abi,
    }),
    sdk.api.abi.call({
      target: weETH,
      abi: abi,
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: weETH,
      abi: abi,
      block: block7dayAgo,
    }),
  ]);

  const apr1d =
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18) * 365 * 100;

  const apr7d =
    ((exchangeRates[0].output - exchangeRates[2].output) / 1e18 / 7) *
    365 *
    100;


  const optimismApi = new sdk.ChainApi({ chain: 'optimism' });
  const restakingWeeklyEigen = Number(await optimismApi.call({
    target: '0xAB7590CeE3Ef1A863E9A5877fBB82D9bE11504da',
    abi: 'function categoryTVL(string _category) view returns (uint256)',
    params: [eigen]
  }));
  const eigenPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/ethereum:${eigen}`)
  ).data.coins['ethereum:ETH']?.price;

  const priceKey = `ethereum:${weETH}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const restakingApy = (restakingWeeklyEigen * price) / 7 / (totalSupply * price) * 365 * 100;
  console.log('restakingApy', restakingApy);
  return [
    {
      pool: weETH,
      chain: 'ethereum',
      project: 'ether.fi-stake',
      symbol: 'weETH',
      tvlUsd: totalSupply * price,
      apyBase: apr1d,
      apyBase7d: apr7d,
      apyReward: restakingApy,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://app.ether.fi/',
};
