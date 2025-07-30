const sdk = require('@defillama/sdk');
const axios = require('axios');

const ibera = '0x9b6761bf2397bb5a6624a856cc84a3a14dcd3fe5';
const bera = '0x0000000000000000000000000000000000000000';
const project = 'infrared-finance';
const symbol = 'ibera';

const apy = async () => {
  const tvl =
    (await sdk.api.erc20.totalSupply({ target: ibera, chain: 'berachain' }))
      .output / 1e18;

  const priceKey = `berachain:${bera}`;
  const beraPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;
  const timestampNow = Math.floor(Date.now() / 1000);
  const timestampYesterday = timestampNow - 86400;

  const blockNow = (
    await axios.get(
      `https://coins.llama.fi/block/berachain/${timestampNow}`
    )
  ).data.height;
  const blockYesterday = (
    await axios.get(`https://coins.llama.fi/block/berachain/${timestampYesterday}`)
  ).data.height;


  const totalPooledBeraYesterday = await sdk.api.abi.call({
    target: ibera,
    chain: 'berachain',
    abi: 'uint256:totalAssets',
    block: blockYesterday,
  });

  const totalPooledBeraToday = await sdk.api.abi.call({
    target: ibera,
    chain: 'berachain',
    abi: 'uint256:totalAssets',
    block: blockNow,
  });
  const totalIberaSupplyYesterday = await sdk.api.abi.call({
    target: ibera,
    chain: 'berachain',
    abi: 'uint256:totalSupply',
    block: blockYesterday,
  });

  const totalIberaSupplyToday = await sdk.api.abi.call({
    target: ibera,
    chain: 'berachain',
    abi: 'uint256:totalSupply',
    block: blockNow,
  });
  const apr = (totalPooledBeraToday.output / totalIberaSupplyToday.output - totalPooledBeraYesterday.output / totalIberaSupplyYesterday.output) * 365 * 100;

  return [
    {
      pool: `${ibera}`,
      chain: 'berachain',
      project,
      symbol,
      underlyingTokens: [bera],
      apyBase: apr,
      apy: apr,
      tvlUsd: totalPooledBeraToday.output / 1e18 * beraPrice,
    },
  ];
};

module.exports = { apy, url: 'https://infrared.finance/ibera' };
