const axios = require('axios');
const sdk = require('@defillama/sdk');
const EarnVault = require('./EarnVault.json');
const Accountant = require('./Accountant.json');

const earnETH = '0x9Ed15383940CC380fAEF0a75edacE507cC775f22';
const accountant = '0x411c78BC8c36c3c66784514f28c56209e1DF2755';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const apy = async () => {
  // TVL calculation
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: earnETH,
        abi: EarnVault.find((m) => m.name === 'totalSupply'),
      })
    ).output / 1e18;

  const priceKey = `ethereum:${WETH}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const currentRate = (
    await sdk.api.abi.call({
      target: accountant,
      abi: Accountant.find((m) => m.name === 'getRate'),
    })
  ).output;
  const tvlUsd = totalSupply * (currentRate / 1e18) * ethPrice;

  // APY calculations
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
      target: accountant,
      abi: Accountant.find((m) => m.name === 'getRate'),
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      target: accountant,
      abi: Accountant.find((m) => m.name === 'getRate'),
      block: block7dayAgo,
    }),
  ]);
  const apr1d = ((currentRate - exchangeRates[0].output) / 1e18) * 365 * 100;

  const apr7d =
    ((currentRate - exchangeRates[1].output) / 1e18 / 7) * 365 * 100;

  return [
    {
      pool: earnETH,
      project: 'swell-eth-earn-vault',
      chain: 'Ethereum',
      symbol: 'earnETH',
      tvlUsd: tvlUsd,
      apyBase: apr1d,
      apyBase7d: apr7d,
      underlyingTokens: [WETH],
    },
  ];
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.swellnetwork.io/earn/vaults',
};
