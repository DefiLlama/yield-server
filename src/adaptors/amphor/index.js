const utils = require('../utils');
const sdk = require('@defillama/sdk');

const poolsFunction = async () => {

  // const wbtc = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
  const wsteth = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
  const prices = (await utils.getPrices([wsteth/*, wbtc*/], 'ethereum'))
    .pricesByAddress;
  const usdcVaultAddress = '0x3b022EdECD65b63288704a6fa33A8B9185b5096b';
  const wstethVaultAddress = '0x2791EB5807D69Fe10C02eED6B4DC12baC0701744';

  const ERC4626TotalAssets =
    {
      "inputs": [],
      "name": "totalAssets",
      "outputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    };

  const wstethAprData = await utils.getData(
    'https://app.amphor.io/api/apr?vaultSelected=ETH&networkId=1'
  );
  const wstethApy = ((1 + Number(wstethAprData.apr)/2600) ** (26) - 1) * 100;

  const usdcAprData = await utils.getData(
    'https://app.amphor.io/api/apr?vaultSelected=USDC&networkId=1'
  );
  const usdcApy = ((1 + Number(usdcAprData.apr)/2600) ** (26) - 1) * 100;

  const usdcTotalAsset = await sdk.api.abi.call({
    abi: ERC4626TotalAssets,
    chain: 'ethereum',
    target: usdcVaultAddress,
  });
  const wstethTotalAsset = await sdk.api.abi.call({
    abi: ERC4626TotalAssets,
    chain: 'ethereum',
    target: wstethVaultAddress,
  });

  const usdcPool = {
    pool: usdcVaultAddress,
    chain: 'ethereum',
    project: 'amphor',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: Number(usdcTotalAsset.output)/1e6,
    apy: usdcApy,
  };

  const wstethPool = {
    pool: wstethVaultAddress,
    chain: 'ethereum',
    project: 'amphor',
    symbol: utils.formatSymbol('WSTETH'),
    tvlUsd: (Number(wstethTotalAsset.output)/1e18) * prices[wsteth.toLowerCase()],
    apy: wstethApy,
  };

  return [usdcPool, wstethPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.amphor.io/earn',
};
