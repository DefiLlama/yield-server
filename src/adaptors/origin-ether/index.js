const utils = require('../utils');

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://analytics.ousd.com/api/v2/oeth/apr/trailing'
  );
  const dataTvl = await utils.getData('https://api.llama.fi/tvl/origin-ether');

  const oeth = {
    pool: 'origin-ether',
    chain: 'Ethereum',
    project: 'origin-ether',
    symbol: 'OETH',
    tvlUsd: dataTvl,
    apy: Number(apyData.apy),
    underlyingTokens: [
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
      '0xae78736Cd615f374D3085123A210448E74Fc6393', // rETH
      '0x5e8422345238f34275888049021821e8e08caa1f', // frxETH
    ],
  };

  return [oeth];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://oeth.com',
};
