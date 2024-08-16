const utils = require('../utils');
const axios = require('axios');
const sdk = require('@defillama/sdk');
const vaultABI = require('./abiVault.json');

const eth_USDC = "0xf3b466F09ef476E311Ce275407Cfb09a8D8De3a7"
const eth_BTC = "0x6efa12b38038A6249B7aBdd5a047D211fB0aD48E"
const eth_ETH = "0x2a2f84e9AfE7b39146CDaF068b06b84EE23892c2"
const arb_USDC = "0xC36E1dd932dd95737bb8895B4B88A01b7d37e871"
const arb_BTC = "0x9aB1D3c233CF7f0f57F4F5e1A297bC5F8ab71dA6"
const arb_ETH = "0x3Ea6319268201f5346B570a91435A61a6ce3fbaD"
const base_USDC = "0xCACf1C081A421D51aE5E142aD6cA1504c8D89dab"
const base_ETH = "0x5398CC5265BCDf23A4d72f08A51Af42b6CA8f2e5"
const avax_USDC = "0xCd89b930eE05d962146a15567a1ec8a23E89700C"

const vaults = {
  "LevUSDC" : {
    "ethereum": eth_USDC,
    "arbitrum": arb_USDC,
    "avax": avax_USDC,
    "base": base_USDC
  },
  "HodlwBTC" : {
    "ethereum": eth_BTC,
    "arbitrum": arb_BTC
  },
  "HodlwETH": {
    "ethereum": eth_ETH,
    "arbitrum": arb_ETH,
    "base": base_ETH
  
  }
}

const mapToUnderlying = (vault) => {
  if (vault === "LEVUSDC") {
    return "USDC";
  }
  if (vault === "HODLWBTC") {
    return "wBTC";
  }
  if (vault === "HODLWETH") {
    return "wETH";
  }
}




const getTokenPrice = async (priceKey, amount, decimals) => {
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  return Number(price) * amount / 10 ** decimals;
};

const getVaultState = async (vaultAddy, chain) => {

  const vaultState = await sdk.api.abi.call({
    abi: vaultABI.find((m) => m.name === "vaultState"),
    target: vaultAddy,
    chain: chain,
  });
 
  return vaultState.output
}

const getVaultParams = async (vaultAddy, chain) => {
  
    const vaultParams = await sdk.api.abi.call({
      abi: vaultABI.find((m) => m.name === "vaultParams"),
      target: vaultAddy,
      chain: chain,
    });
  
    return vaultParams.output
  }

const getAPY = async (vaultAddy, chain) => {
  const currRound = (await getVaultState(vaultAddy, chain))[0];
  const prevPricePerShare = (await sdk.api.abi.call({
    abi: vaultABI.find((m) => m.name === "roundPricePerShare"),
    target: vaultAddy,
    chain: chain,
    params: [currRound - 2],
  })).output;
  
  const currPricePerShare = (await sdk.api.abi.call({
    abi: vaultABI.find((m) => m.name === "roundPricePerShare"),
    target: vaultAddy,
    chain: chain,
    params: [currRound - 1],
  })).output;

  const apy = (currPricePerShare - prevPricePerShare) / prevPricePerShare * 100 * 52;
  return apy;
}


const main = async () => {
  // const data = await utils.getData('https://api.streamprotocol.money/vaults');
  const pools = [];
  
  for (const entry of Object.keys(vaults)) {
    for (const chain of Object.keys(vaults[entry])) {

      const vaultParams = await getVaultParams(vaults[entry][chain], chain);
      pools.push({
        pool: `${vaults[entry][chain]}-${chain}`,
        chain: utils.formatChain(chain),
        project: 'stream-finance',
        symbol: mapToUnderlying(utils.formatSymbol(entry)),
        tvlUsd: await getTokenPrice(`${chain}:${vaultParams[1]}`, Number((await getVaultState(vaults[entry][chain], chain))[1]), vaultParams[0]),
        apy: await getAPY(vaults[entry][chain], chain),
        poolMeta: utils.formatSymbol(entry)
      });
    }
   
  }

  return pools.filter((pool) => {
    return utils.keepFinite(pool);
  });

}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.streamprotocol.money',
}; 
