const axios = require("axios");
const utils = require("../utils");

const project = "steadefi";

async function apy() {
  const vaultResponse = (
    await axios.get(`https://api.steadefi.com/vaults`)
  ).data;

  const lendingPoolResponse =  (
    await axios.get(`https://api.steadefi.com/lending-pools`)
  ).data
  
  const vaults = vaultResponse
    .filter((v) => v.status !== "Hidden")
    .map((p) => {
      const chainString = utils.formatChain(chainMapping[p.chainId])

      return {
        pool: `${p.address}-${chainString}`.toLowerCase(),
        chain: chainString,
        project,
        symbol: utils.formatSymbol(p.symbol),
        poolMeta: p.protocol,
        tvlUsd: Number(p.data.equityValue),
        apy: utils.aprToApy(Number(p.data.apr.totalApr * 100)),
      }
    });

  const lendingPools =  lendingPoolResponse
  .filter((v) => v.status !== "Hidden")
  .map((p) => {
    const chainString = utils.formatChain(chainMapping[p.chainId])

    return {
      pool: `${p.address}-${chainString}`.toLowerCase(),
      chain: chainString,
      project,
      symbol: utils.formatSymbol(p.symbol),
      tvlUsd: Number(p.data.totalValue) * Number(p.data.price),
      apy: utils.aprToApy(Number(p.data.apr.lendApr * 100)),
    }
  });

  return [...lendingPools, ...vaults]
}

const chainMapping = {
  43114: "avax",
  42161: "arbitrum",
};

const main = async () => {
  const data = await apy()

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: "https://steadefi.com/vaults",
};
