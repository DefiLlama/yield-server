const { ethers, Contract, BigNumber } = require('ethers');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const vaultABI = {
  inputs: [],
  name: 'totalValue',
  outputs: [{ internalType: 'uint256', name: 'value', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const vaultAddress = '0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab';

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://analytics.ousd.com/api/v2/oeth/apr/trailing'
  );
  const totalValueEth = (
    await sdk.api.abi.call({
      target: vaultAddress,
      abi: vaultABI,
    })
  ).output;

  const priceData = await utils.getData(
    'https://coins.llama.fi/prices/current/coingecko:ethereum?searchWidth=4h'
  );
  const ethPrice = priceData.coins['coingecko:ethereum'].price;

  const tvlUsd = (totalValueEth / 1e18) * ethPrice;

  const oethData = {
    pool: '0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3',
    chain: 'Ethereum',
    project: 'origin-ether',
    symbol: 'OETH',
    tvlUsd,
    apy: Number(apyData.apy),
    underlyingTokens: [
      '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
      '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
      '0xae78736Cd615f374D3085123A210448E74Fc6393', // rETH
      '0x5e8422345238f34275888049021821e8e08caa1f', // frxETH
    ],
  };

  return [oethData];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://oeth.com',
};
