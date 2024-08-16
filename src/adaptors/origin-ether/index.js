const { ethers, Contract, BigNumber } = require('ethers');
const sdk = require('@defillama/sdk');

const WETH_TOKEN = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const OETH_TOKEN = '0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3';

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
    pool: OETH_TOKEN,
    chain: 'Ethereum',
    project: 'origin-ether',
    symbol: 'OETH',
    tvlUsd,
    apy: Number(apyData.apy),
    underlyingTokens: [
      WETH_TOKEN,
    ],
  };

  return [oethData];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://originprotocol.com/oeth',
};
