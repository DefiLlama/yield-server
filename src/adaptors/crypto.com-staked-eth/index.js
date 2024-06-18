const sdk = require('@defillama/sdk');
const axios = require('axios');

const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const cdceth = {
  ethereum: '0xfe18aE03741a5b84e39C295Ac9C856eD7991C38e',
  cronos: '0x7a7c9db510aB29A2FC362a4c34260BEcB5cE3446',
};

const abi = 'function exchangeRate() external view returns (uint256)';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: cdceth.cronos,
        abi: 'erc20:totalSupply',
        chain: 'cronos',
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

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: cdceth.ethereum,
      abi: abi,
    }),
    sdk.api.abi.call({
      target: cdceth.ethereum,
      abi: abi,
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: cdceth.ethereum,
      abi: abi,
      block: block7dayAgo,
    }),
  ]);

  const apr1d =
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18) * 365 * 100;

  const apr7d =
    ((exchangeRates[0].output - exchangeRates[2].output) / 1e18) * 52 * 100;

  const priceKey = `ethereum:${weth}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: cdceth.cronos,
      chain: 'cronos',
      project: 'crypto.com-staked-eth',
      symbol: 'cdcETH',
      tvlUsd: totalSupply * price,
      apyBase: apr7d,
      apyBase7d: apr7d,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://crypto.com/staking',
};
