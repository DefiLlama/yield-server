const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const CHAIN_ID_MAPPING = {
  ethereum: 1,
  arbitrum: 42161,
  base: 8453,
};

const abiVaultResolver = require('./abiVaultResolver');
const vaultResolver = {
  ethereum: '0x49290f778faAD125f2FBCDE6F09600e73bf4bBd9',
  // arbitrum: '0xdF4d3272FfAE8036d9a2E1626Df2Db5863b4b302',
  // base: '0x3aF6FBEc4a2FE517F56E402C65e3f4c3e18C1D86',
};

const getApy = async (chain) => {
  const vaultsEntireData = (
    await sdk.api.abi.call({
      target: vaultResolver[chain],
      abi: abiVaultResolver.find((m) => m.name === 'getVaultsEntireData'),
      chain,
    })
  ).output;

  console.log(vaultsEntireData[0]);

  const symbol = vaultsEntireData.map((o) => o[3][10]);
  const pool = vaultsEntireData.map((o) => o[0]);

  console.log("this is vaultID");
  console.log(symbol);

  const suppliedTokens = vaultsEntireData.map((o) => o[8][5]);

  const underlyingToken = vaultsEntireData.map((o) => {
    let tokens = [];
    tokens.push(o[3][8][0]);
    tokens.push(o[3][9][0]);
    if (o[3][8][1] != '0x0000000000000000000000000000000000000000') {
      tokens.push(o[3][8][1]);
    }
    if (o[3][9][1] != '0x0000000000000000000000000000000000000000') {
      tokens.push(o[3][9][1]);
    }
    return tokens;
  });

  // const decimals = (
  //   await sdk.api.abi.multiCall({
  //     calls: underlying.map((t) => ({ target: t })),
  //     abi: 'erc20:decimals',
  //     chain,
  //   })
  // ).output.map((o) => o.output);

  // const priceKeys = underlying.map((i) => `${chain}:${i}`).join(',');
  // const prices = (
  //   await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  // ).data.coins;

  const pools = vaultsEntireData.map((token, i) => {
    const tokenAddress = token.tokenAddress;
    // const underlyingToken = token.asset;
    const underlyingSymbol = symbol[i];
    const decimals = token.decimals;
    const tokenPrice = prices[`${chain}:${underlying[i]}`].price;

    const totalSupplyUsd = (token.totalAssets * tokenPrice) / 10 ** decimals;

    const apyBase = Number((token.supplyRate / 1e2).toFixed(2));
    const apyReward = Number((token.rewardsRate / 1e12).toFixed(2));

    return {
      project: 'fluid-vaults',
      pool: tokenAddress,
      tvlUsd: totalSupplyUsd,
      symbol: underlyingSymbol,
      underlyingTokens: [underlyingToken],
      rewardTokens: [underlyingToken], // rewards are always in underlying
      chain,
      apyBase,
      apyReward,
    };
  });

  return pools.filter((i) => utils.keepFinite(i));
};

const apy = async () => {
  const chains = Object.keys(CHAIN_ID_MAPPING);
  const apy = await Promise.all(chains.map((chain) => getApy(chain)));
  return apy.flat();
};



module.exports = {
    apy,
    url: `https://fluid.instadapp.io/vaults/`,
  };
  
 async function getApyAndLog() {
    try {
      const result = await apy();
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error("Error fetching APY:", error);
    }
  }
  
  getApyAndLog();
console.log("Script started");