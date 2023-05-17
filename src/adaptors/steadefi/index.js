const axios = require("axios");
const utils = require("../utils");

const project = "steadefi";

async function apy(chainId) {
  const response = (
    await axios.get(`https://api.steadefi.com/vaults`, {
      params: { chainId },
    })
  ).data;

  const chainString = utils.formatChain(chainMapping[chainId]);

  return response
    .filter((v) => v.status !== "Hidden")
    .map((p) => ({
      pool: `${p.address}-${chainString}`.toLowerCase(),
      chain: chainString,
      project,
      symbol: utils.formatSymbol(p.symbol),
      poolMeta: p.protocol,
      tvlUsd: Number(p.data.equityValue),
      apy: utils.aprToApy(Number(p.data.apr.totalApr * 100)),
    }));
}

const chainMapping = {
  43114: "avax",
  42161: "arbitrum",
};

const main = async () => {
  const data = await Promise.all(
    Object.keys(chainMapping).map(async (chainId) => apy(chainId))
  );

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: "https://app.alpacafinance.org/farm",
};
