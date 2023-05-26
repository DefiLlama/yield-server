const { ethers, Contract, BigNumber } = require('ethers');
const utils = require('../utils');

const PROVIDER_URL = process.env.ALCHEMY_CONNECTION_ETHEREUM;

const vaultABI = [
  'function totalValue() view returns (uint256)',
  'function priceUnitRedeem(address asset) view returns (uint256)',
]

const vaultAddress = '0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab'

const poolsFunction = async () => {
  const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
  const vault = new Contract(vaultAddress, vaultABI, provider);

  const apyData = await utils.getData(
    'https://analytics.ousd.com/api/v2/oeth/apr/trailing'
  );
  const totalValueEth = await vault.totalValue();

  const priceData = await utils.getData(
    'https://coins.llama.fi/prices/current/coingecko:ethereum?searchWidth=4h'
  );
  const ethPrice = priceData.coins['coingecko:ethereum'].price

  const tvlUsd = totalValueEth
    .mul(ethers.utils.parseEther(ethPrice.toString()))
    .div(BigNumber.from('10').pow(36 - 8))
    .toNumber() / 10**8

  const oethData = {
    pool: 'origin-ether',
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
