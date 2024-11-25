const axios = require('axios');
const sdk = require('@defillama/sdk');

const erc20Abi = require('./abis/erc20.abi.json');
const potionAbi = require('./abis/potion.abi.json');

const BASE_URL = 'https://coins.llama.fi/prices/current/';
const POTIONS_URL = 'https://yel.finance/potions';

const CHAINS = {
  81457 : 'Blast',
  8453  : 'Base',
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
        '0x0540f15374eCF13aAB3c0a76b643333CE0D00579' : '0x4200000000000000000000000000000000000006',  // lWETH / WETH
        '0xE7349C94BDE0D13599Ed496342857bb231FeF02B' : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // lUSDC / USDC
        '0x516712404013200B499Cd8fAE4575E5d48F6Ba65' : '0x949185D3BE66775Ea648F4a306740EA9eFF9C567'   // lYEL / YEL
      },
  250 : {
    //                  Potion                                       Potion Base token    
        '0x0DedEB29036C25cb764BC4fb34e76C6Fb08DfF7a' : '0x949185D3BE66775Ea648F4a306740EA9eFF9C567',  // lYEL / YEL
        '0x64a5A53d6393C71C375D5DF6a835552C04835d76' : '0x1B6382DBDEa11d97f24495C9A90b7c88469134a4',  // laxlUSDC / axlUSDC
        '0x535ab2D8d3250b403251bB5BC647902B33F7Fc98' : '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83'   // lWFTM / lWFTM
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
