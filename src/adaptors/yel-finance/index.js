const axios = require('axios');
const sdk = require('@defillama/sdk');

const erc20Abi = require('./abis/erc20.abi.json');
const potionAbi = require('./abis/potion.abi.json');

const BASE_URL = 'https://coins.llama.fi/prices/current/';
const POTIONS_URL = 'https://yel.finance/potions';

const CHAINS = {
  81457: 'Blast',
  8453: 'Base',
  250   : 'Fantom'
};

const PROJECT_NAME = 'yel-finance';

const POTION_SINGLE_STAKING_LIST = {
  81457: {
    //                  Potion                                       Potion Base token
        '0x795a85CD543D0E2d29F7e11e33a20a38A4b5121e': '0x4300000000000000000000000000000000000004',  // lWETH / WETH
        '0x07BF0Bc908Ef4badF8ec0fB1f77A8dBFe33c33c0': '0xb1a5700fA2358173Fe465e6eA4Ff52E36e88E2ad',  // lBLAST / Blast
        '0x7d2f5881F0C4B840fcFA2c49F4052d1A004eAf0d': '0x949185D3BE66775Ea648F4a306740EA9eFF9C567',  // lYEL / YEL
      },
  8453 : {
    //                  Potion                                       Potion Base token
        '0x56a827776511689d6502c5213425c4BFBE3915d1' : '0x4200000000000000000000000000000000000006',  // lWETH / WETH
        '0x8ca29479CECa6eE24539508B90A02ec1939B88c6' : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // lUSDC / USDC
        '0x1DC50dA045Ad23812c22148e03D62C9691958B47' : '0x949185D3BE66775Ea648F4a306740EA9eFF9C567'   // lYEL / YEL
      },
  250 : {
    //                  Potion                                       Potion Base token
        '0x97bB72E43Dc056621cBeC637e558C654A5cDe7d2' : '0x949185D3BE66775Ea648F4a306740EA9eFF9C567',  // lYEL / YEL
        '0x5FF262D0c0Ecd0923DE3d9C0be6308D86F1229B4' : '0x1B6382DBDEa11d97f24495C9A90b7c88469134a4',  // laxlUSDC / axlUSDC
        '0x9F7908Fc313f7A276c8366C5892839a26e66B5Bc' : '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83'   // lWFTM / lWFTM
      }
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

  const adjustedBaseAssetOnPotion = formatNumber(baseAssetOnPotion.output, baseAssetDecimals.output)
  const adjustedTotalSupplyPotion = formatNumber(totalSupplyPotion.output, decimalsPotion.output)

  const backingRatio =  adjustedBaseAssetOnPotion / adjustedTotalSupplyPotion  - 1; //1 is basic constant
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
