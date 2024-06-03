const utils = require('../utils');
const sdk = require('@defillama/sdk');

const poolsFunction = async () => {

  const wbtc = "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599";
  const wsteth = "0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0";
  const prices = (await utils.getPrices([wsteth, wbtc], 'ethereum'))
    .pricesByAddress;
  const usdcVaultAddress = '0x3b022EdECD65b63288704a6fa33A8B9185b5096b';
  const wstethVaultAddress = '0x2791EB5807D69Fe10C02eED6B4DC12baC0701744';
  const wbtcVaultAddress = '0xC4A324fDF8a2495776B4d6cA46599B5a52f96489';

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
    'https://app.amphor.io/api/apr?vault=wstethVault'
  );
  const wstethApy = ((1 + Number(JSON.stringify(wstethAprData.wstethVault.strategyNetAPR))/2600) ** (26) - 1) * 100;

  const usdcAprData = await utils.getData(
    'https://app.amphor.io/api/apr?vault=usdcVault'
  );
  const usdcApy = ((1 + Number(JSON.stringify(usdcAprData.usdcVault.strategyNetAPR))/2600) ** (26) - 1) * 100;

  const wbtcAprData = await utils.getData(
    'https://app.amphor.io/api/apr?vault=wbtcVault'
  );
  const wbtcApy = ((1 + Number(JSON.stringify(wbtcAprData.wbtcVault.strategyNetAPR))/2600) ** (26) - 1) * 100;

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
  const wbtcTotalAsset = await sdk.api.abi.call({
    abi: ERC4626TotalAssets,
    chain: 'ethereum',
    target: wbtcVaultAddress,
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

  const wbtcPool = {
    pool: wbtcVaultAddress,
    chain: 'ethereum',
    project: 'amphor',
    symbol: utils.formatSymbol('WBTC'),
    tvlUsd: (Number(wbtcTotalAsset.output)/1e8) * prices[wbtc.toLowerCase()],
    apy: wbtcApy,
  };

  return [usdcPool, wstethPool, wbtcPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.amphor.io/earn',
};
