const axios = require('axios');
const sdk = require('@defillama/sdk');

const erc20Abi = require('./abis/erc20.abi.json');
const potionAbi = require('./abis/potion.abi.json');

const YEL_ADDRESS = '0x949185d3be66775ea648f4a306740ea9eff9c567';
const WETH_BLAST_ADDRESS = '0x4300000000000000000000000000000000000004';
const BLAST_ADDRESS = '0xb1a5700fA2358173Fe465e6eA4Ff52E36e88E2ad';
const BASE_URL = 'https://coins.llama.fi/prices/current/';
const POTIONS_URL = 'https://yel.finance/potions';

const CHAINS = {
  81457: 'Blast',
  //   1: 'Ethereum',
  //   250: 'Fantom',
  //   59144: 'Linea',
  //   169: 'Manta',
  // 2525: 'inEVM',
};

const PROJECT_NAME = 'yel-finance';

const POTION_SINGLE_STAKING_LIST = {
  81457: {
    '0x795a85CD543D0E2d29F7e11e33a20a38A4b5121e': WETH_BLAST_ADDRESS, //WETH SINGLE STAKING POTION
    '0x07BF0Bc908Ef4badF8ec0fB1f77A8dBFe33c33c0': BLAST_ADDRESS, //BLAST SINGLE STAKING POTION
    '0x7d2f5881F0C4B840fcFA2c49F4052d1A004eAf0d': YEL_ADDRESS, //YEL SINGLE STAKING POTION
  },
};

const formatNumber = (n, decimals) => {
  return n / 10 ** decimals;
};

const getAPY = async () => {
  const promises = Object.keys(POTION_SINGLE_STAKING_LIST).map((chainId) => {
    return Object.keys(POTION_SINGLE_STAKING_LIST[chainId]).map((address) => {
      return getData({
        chainId: Number(chainId),
        address,
      });
    });
  });

  return await Promise.all(promises.flat());
};

const getData = async ({ chainId, address }) => {
  const baseToken = [POTION_SINGLE_STAKING_LIST[chainId][address]];
  const calls = [];
  const chain = CHAINS[chainId].toLowerCase();

  const baseAsset = await sdk.api.abi.call({
    target: address,
    abi: potionAbi.find(({ name }) => name === 'getAllAssets'),
    chain,
  });

  const decimalsPotion = await sdk.api.abi.call({
    target: address,
    abi: potionAbi.find(({ name }) => name === 'decimals'),
    chain,
  });

  const totalSupplyPotion = await sdk.api.abi.call({
    target: address,
    abi: potionAbi.find(({ name }) => name === 'totalSupply'),
    chain,
  });

  const createdPotion = await sdk.api.abi.call({
    target: address,
    abi: potionAbi.find(({ name }) => name === 'created'),
    chain,
  });

  const symbol = await sdk.api.abi.call({
    target: baseAsset.output[0].token,
    abi: erc20Abi.find(({ name }) => name === 'symbol'),
    chain,
  });

  const baseAssetOnPotion = await sdk.api.abi.call({
    target: baseAsset.output[0].token,
    abi: erc20Abi.find(({ name }) => name === 'balanceOf'),
    params: [address],
    chain,
  });

  const baseAssetDecimals = await sdk.api.abi.call({
    target: baseAsset.output[0].token,
    abi: erc20Abi.find(({ name }) => name === 'decimals'),
    chain,
  });

  const backingRatio = baseAssetOnPotion.output / totalSupplyPotion.output - 1; //1 is basic constant
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timePassedSinceDeployment = currentTimestamp - createdPotion.output;

  const rewardsPerSec = backingRatio / timePassedSinceDeployment;
  const apr = rewardsPerSec * 60 * 60 * 24 * 365 * 100; // mul 100 == convert to percent
  const { data } = await axios.get(
    `${BASE_URL}${CHAINS[chainId]}:${baseAsset.output[0].token}`
  );

  const baseTokenPrice =
    data.coins[`${CHAINS[chainId]}:${baseAsset.output[0].token}`].price;
  const baseAssetAmountFormated = formatNumber(
    baseAssetOnPotion.output,
    baseAssetDecimals.output
  );
  const tvl = baseAssetAmountFormated * baseTokenPrice;

  return {
    chain: CHAINS[chainId],
    project: PROJECT_NAME,
    pool: `${chainId}-${address}`,
    symbol: symbol.output.replace('i', ''),
    apyBase: Number(apr),
    tvlUsd: Number(tvl),
  };
};

module.exports = {
  apy: getAPY,
  url: POTIONS_URL,
};
