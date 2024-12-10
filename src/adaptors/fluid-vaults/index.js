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

  const filteredVaultsEntireData = vaultsEntireData.filter(
    (o) => o[1] == false && o[2] == false
  );

  const symbol = filteredVaultsEntireData.map((o) => o[3][10]);
  const pool = filteredVaultsEntireData.map((o) => o[0]);

  const underlyingTokenss = filteredVaultsEntireData.map((o) => {
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

  const rewardsRate = filteredVaultsEntireData.map((o) => o[5][12]);
  const supplyRate = filteredVaultsEntireData.map((o) => o[5][10]);

  const calls = filteredVaultsEntireData.map((o) =>
    o[3][8][0] === '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
      ? null
      : { target: o[3][8][0] }
  );

  const supplyTokens = filteredVaultsEntireData.map((o) => o[3][8][0]);

  const decimals = (
    await sdk.api.abi.multiCall({
      calls: calls.filter((call) => call !== null),
      abi: 'erc20:decimals',
      chain,
    })
  ).output.map((o, index) => o.output);

  // Reinsert 18 for the native token addresses
  decimals.splice(
    calls.reduce((acc, call, idx) => (call === null ? [...acc, idx] : acc), []),
    0,
    ...calls.filter((call) => call === null).map(() => 18)
  );

  const suppliedTokens = filteredVaultsEntireData.map((o) => o[8][5]);
  const priceKeys = supplyTokens.map((i) => `${chain}:${i}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const tokenPrices = supplyTokens.map(
    (token) => prices[`${chain}:${token}`].price
  );

  const totalSupplyUsd = suppliedTokens.map(
    (o, i) => (o * tokenPrices[i]) / 10 ** decimals[i]
  );

  const pools = filteredVaultsEntireData.map((token, i) => {
    const apyBase = Number((supplyRate[i] / 1e2).toFixed(2));
    const apyReward = Number((rewardsRate[i] / 1e12).toFixed(2));

    return {
      project: 'fluid-vaults',
      pool: pool[i],
      tvlUsd: totalSupplyUsd[i],
      symbol: symbol[i],
      underlyingTokens: [underlyingTokenss[i]],
      rewardTokens: [underlyingTokenss[i]], // rewards are always in underlying
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
    const result = await apy(); // Call the exported apy() function
    console.log(JSON.stringify(result, null, 2)); // Pretty print for better readability
  } catch (error) {
    console.error('Error occurred:', error);
  }
}

getApyAndLog();