const sdk = require('@defillama/sdk');
const axios = require('axios');

const vault = '0x122ee24cb3cc1b6b987800d3b54a68fc16910dbf';
const inETH = '0xf073bAC22DAb7FaF4a3Dd6c6189a70D54110525C'
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const apy = async () => {
  const totalSupply =
    (
      await sdk.api.abi.call({
        target: inETH,
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

  const day = 0
    
  const abi = 'function averagePercentageRate(' + inETH + ',' + day + ') external view returns (uint256)';

  day = 1
  
  const apr1d =
    (await sdk.api.abi.call({
        target: vault,
        abi: 'abi',
      }) / 1e18);

  day = 7
  
  const apr1d =
    (await sdk.api.abi.call({
        target: vault,
        abi: 'abi',
      }) / 1e18 / 7);

  const priceKey = `ethereum:${inETH}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: inETH,
      chain: 'ethereum',
      project: 'Inception',
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
