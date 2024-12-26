const sdk = require('@defillama/sdk');
const axios = require('axios');

const abi = require('./abi');
const abiVault = require('./abiVault');

const inETH = '0xf073bAC22DAb7FaF4a3Dd6c6189a70D54110525C';
const vault = '0x122ee24cb3cc1b6b987800d3b54a68fc16910dbf';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: inETH,
        abi: 'erc20:totalSupply',
      })
    ).output / 1e18;

  const apr1d =
    (
      await sdk.api.abi.call({
        target: vault,
        abi: abiVault.find((m) => m.name === 'averagePercentageRate'),
        params: [inETH, 1],
      })
    ).output / 1e18;

  const apr7d =
    (
      await sdk.api.abi.call({
        target: vault,
        abi: abiVault.find((m) => m.name === 'averagePercentageRate'),
        params: [inETH, 7],
      })
    ).output / 1e18;

  const priceKey = `ethereum:${inETH}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: inETH,
      chain: 'ethereum',
      project: 'genesislrt-(native-restaking)',
      symbol: 'inETH',
      tvlUsd: totalSupply * price,
      apyBase: apr1d,
      apyBase7d: apr7d,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.inceptionlrt.com/app/restaking/restake/?token=ETH',
};
