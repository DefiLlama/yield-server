const { ethers, Contract, BigNumber } = require('ethers');
const sdk = require('@defillama/sdk');
const { capitalizeFirstLetter } = require('../utils');

const ETHEREUM_WETH_TOKEN = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const ETHEREUM_OETH_TOKEN = '0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3';
const BASE_WETH_TOKEN = '0x4200000000000000000000000000000000000006';
const BASE_SUPER_OETH_TOKEN = '0xDBFeFD2e8460a6Ee4955A68582F85708BAEA60A3';

const utils = require('../utils');

const vaultABI = {
  inputs: [],
  name: 'totalValue',
  outputs: [{ internalType: 'uint256', name: 'value', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
const oethVaultAddress = '0x39254033945AA2E4809Cc2977E7087BEE48bd7Ab';
const superOETHbVaultAddress = '0x98a0CbeF61bD2D21435f433bE4CD42B56B38CC93';

const fetchPoolData = async ({ chain, vaultAddress, apyUrl, token, symbol, project, underlyingToken }) => {
  const priceData = await utils.getData(
    'https://coins.llama.fi/prices/current/coingecko:ethereum?searchWidth=4h'
  );
  const ethPrice = priceData.coins['coingecko:ethereum'].price;

  const apyData = await utils.getData(apyUrl);

  const totalValueEth = (
    await sdk.api.abi.call({
      chain,
      target: vaultAddress,
      abi: vaultABI,
    })
  ).output;

  const tvlUsd = (totalValueEth / 1e18) * ethPrice;

  return {
    pool: token,
    chain: capitalizeFirstLetter(chain),
    project,
    symbol,
    tvlUsd,
    apy: Number(apyData.apy),
    underlyingTokens: [underlyingToken],
  };
};

const poolsFunction = async () => {
  const oethData = await fetchPoolData({
    chain: 'ethereum',
    vaultAddress: oethVaultAddress,
    apyUrl: 'https://analytics.ousd.com/api/v2/oeth/apr/trailing',
    token: ETHEREUM_OETH_TOKEN,
    symbol: 'OETH',
    project: 'origin-ether',
    underlyingToken: ETHEREUM_WETH_TOKEN,
  });

  const superOETHbData = await fetchPoolData({
    chain: 'base',
    vaultAddress: superOETHbVaultAddress,
    apyUrl: 'https://api.originprotocol.com/api/v2/superoethb/apr/trailing',
    token: BASE_SUPER_OETH_TOKEN,
    symbol: 'superOETHb',
    project: 'origin-ether',
    underlyingToken: BASE_WETH_TOKEN,
  });

  return [oethData, superOETHbData];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://originprotocol.com',
};
