const axios = require('axios');
const sdk = require('@defillama/sdk');

const erc20Abi = require('./abis/erc20.abi.json');
const potionAbi = require('./abis/potion.abi.json');

const BASE_URL = 'https://coins.llama.fi/prices/current/';
const POTIONS_URL = 'https://yel.finance/potions';

const CHAINS = {
  81457: 'Blast',
  8453: 'Base',
  250   : 'Fantom',
  146   : 'Sonic'
};

const PROJECT_NAME = 'yel-finance';

const POTION_SINGLE_STAKING_LIST = {
  81457: {
    //                  Potion                                       Potion Base token
        '0x795a85CD543D0E2d29F7e11e33a20a38A4b5121e': '0x4300000000000000000000000000000000000004',  // lWETH / WETH
        '0x07BF0Bc908Ef4badF8ec0fB1f77A8dBFe33c33c0': '0xb1a5700fA2358173Fe465e6eA4Ff52E36e88E2ad',  // lBLAST / Blast
        '0x7d2f5881F0C4B840fcFA2c49F4052d1A004eAf0d': '0x949185D3BE66775Ea648F4a306740EA9eFF9C567',  // lYEL / YEL
        '0xC107e89b842403D3f3Be56D3b611a74388FF69dA': '0xe36072dd051ce26261bf50cd966311cab62c596e'   // lTHRUST / THRUST
      },
  8453 : {
    //                  Potion                                       Potion Base token
        '0x56a827776511689d6502c5213425c4BFBE3915d1' : '0x4200000000000000000000000000000000000006',  // lWETH / WETH
        '0x8ca29479CECa6eE24539508B90A02ec1939B88c6' : '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',  // lUSDC / USDC
        '0x1DC50dA045Ad23812c22148e03D62C9691958B47' : '0x949185D3BE66775Ea648F4a306740EA9eFF9C567',  // lYEL / YEL
        '0x2c21bFc177E297A83EAa87793c29E592fe81CeAC': '0x79bbF4508B1391af3A0F4B30bb5FC4aa9ab0E07C'    // lANON / ANON
      },
  250 : {
    //                  Potion                                       Potion Base token
        '0x97bB72E43Dc056621cBeC637e558C654A5cDe7d2' : '0x949185D3BE66775Ea648F4a306740EA9eFF9C567',  // lYEL / YEL
        '0x5FF262D0c0Ecd0923DE3d9C0be6308D86F1229B4' : '0x1B6382DBDEa11d97f24495C9A90b7c88469134a4',  // laxlUSDC / axlUSDC
        '0x9F7908Fc313f7A276c8366C5892839a26e66B5Bc' : '0x21be370D5312f44cB42ce377BC9b8a0cEF1A4C83'   // lWFTM / lWFTM
      },

  146  : {
    '0x7Ba0abb5f6bDCbf6409BB2803CdF801215424490': '0x039e2fB66102314Ce7b64Ce5Ce3E5183bc94aD38',    // LSONIC / SONIC
    '0x995171196618b7FE0F0C6D606D79583DD1c8ff60': '0x29219dd400f2Bf60E5a23d13Be72B486D4038894',    // lUSDC / USDC
    '0x92Dd17b19F74E696502Ee9eD478901F24c5d9a9A': '0x79bbF4508B1391af3A0F4B30bb5FC4aa9ab0E07C',    // lANON / ANON
    '0xecf1b589F47511D23b026eF53D16FEbB89Aa5f3A': '0x0e0Ce4D450c705F8a0B6Dd9d5123e3df2787D16B',    // lWAGMI / WAGMI
    '0x6E074300A7Bf53af6e20f1f07dDDfeedAE5598A8': '0x949185D3BE66775Ea648F4a306740EA9eFF9C567',     // lYEL / YEL -
    '0xdE31054Fb0ee7c6C39641db2e677011E276644aC': '0x9fDbC3f8Abc05Fa8f3Ad3C17D2F806c1230c4564',    // lGOGLZ / GOGLZ
    '0x555733fBa1CA24ec45e7027E00C4B6c5065BaC96': '0xE5DA20F15420aD15DE0fa650600aFc998bbE3955',    // lstS / stS
    '0x85262a5121B8aD219C521665787A6F21eCbBf679': '0x7A0C53F7eb34C5BC8B01691723669adA9D6CB384',    // lBOO / BOO -
    '0x30Fb515Cf3e0C7fF94Aa923788B466F44768cAA4': '0x59524D5667B299c0813Ba3c99a11C038a3908fBC',    // lYOKO / YOKO
    '0x2C7A01DE0c419421EB590F9ECd98cBbca4B9eC2A': '0xd3DCe716f3eF535C5Ff8d041c1A41C3bd89b97aE',     // lscUSD / scUSD
    '0x8a3B47d5e13fCeD000dC4cDcbE28EAA2A5Cc24e1': '0x3bcE5CB273F0F148010BbEa2470e7b5df84C7812',     // lscETH / scETH
    '0xde1F938A7EfE5203E66B4D0efA667f116cBC7C45': '0xb1e25689D55734FD3ffFc939c4C3Eb52DFf8A794',     // lOS / OS
    '0x828CAd5913CDbdf53A7a538647c8a27CB04a7112': '0x0e899dA2aD0817ed850ce68f7f489688E4D42D9D',     // lGhog / GHOG
    '0x75a65a8920Da26eBcCb79001ddE5F51AF0160006': '0x3333111A391cC08fa51353E9195526A70b333333',     // lx33 / x33 
    '0x24B77F92692496a374d67e277e6991DE5Ad73a48': '0x50c42dEAcD8Fc9773493ED674b675bE577f2634b',     // lWETH / WETH
    '0xBf7D0b0A5F520C7a4E45cf907502072846488d70': '0xddddd1b4a383dcB89938bC8b8964Cad3C632Fad0',     //  lMyrd / MYRD
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
      data.coins[`${CHAINS[chainId]}:${baseAsset.output[0].token}`]?.price || 0;

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
