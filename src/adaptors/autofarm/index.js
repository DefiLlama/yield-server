const superagent = require("superagent");
const utils = require("../utils");

const chainsMapping = {
  aurora: "aurora",
  avax: "avalanche",
  boba: "boba",
  bsc: "binance",
  celo: "celo",
  cronos: "cronos",
  evmos: "evmos",
  fantom: "fantom",
  gnosis: "xdai",
  harmony: "harmony",
  heco: "heco",
  kcc: "kcc",
  moonbeam: "moonbeam",
  moonriver: "moonriver",
  oasis: "oasis",
  okc: "okexchain",
  polygon: "polygon",
  velas: "velas",
  wanchain: "wanchain",
};

async function getAutofarmBuildId() {
  const homeUrl = "https://autofarm.network/";
  const home = (await superagent.get(homeUrl)).text;
  const start = home.indexOf('"buildId":');
  return home.slice(start + 11, start + 32);
}

async function getMetadataRoot() {
  const buildId = await getAutofarmBuildId();
  const url = `https://autofarm.network/_next/data/${buildId}/index.json`;
  return (await superagent.get(url)).body.pageProps.initialFarmDataByChain;
}

function formatPoolsApyChain(chain) {
  // Lack of standardization inside autofarm data structures
  if (chain === "gnosis") return "xdai";
  if (chain === "okc") return "okex";
  return chain;
}

async function getPoolsApy(chain) {
  const poolsUrl = `https://static.autofarm.network/${formatPoolsApyChain(
    chain
  )}/farm_data_live.json`;
  return (await superagent.get(poolsUrl)).body;
}

function cleanLP(text) {
  return text.replace(" BLP", "").replace(" LP", "");
}

function autofarmApyItem(chain, item) {
  return {
    pool: `autofarm-${item.pid}-${chainsMapping[chain]}`,
    chain: utils.formatChain(chainsMapping[chain]),
    project: "autofarm",
    symbol: utils.formatSymbol(cleanLP(item.wantName)),
    poolMeta: item.farm,
    tvlUsd: Number(item.poolWantTVL),
    apy: item.APY_total * 100,
  };
}

async function autofarmApyAllItems() {
  const metadataRoot = await getMetadataRoot();

  // Iterate through hardcoded chains
  const farmsByChain = await Promise.all(
    Object.keys(chainsMapping).map(async (chain) => {
      const poolsApy = await getPoolsApy(chain);
      const poolsMetadata = metadataRoot[chain].pools;

      // Combine pool APY and Metadata in a single object
      const pools = Object.keys(poolsMetadata)
        .filter((key) => key != "tokens") // Removing extra info on json
        .map((key) => {
          return Object.assign({}, poolsMetadata[key], poolsApy[key]);
        });

      // Generate Llama's APY object for individual and depositable items
      const activePools = pools.filter((v) => v.allowDeposits);
      return activePools.map((item) => {
        return autofarmApyItem(chain, item);
      });      
    })
  );

  // Flatten list of lists
  let farms = [].concat.apply([], farmsByChain); 

  return farms.filter((p) => utils.keepFinite(p));
}

module.exports = {
  timetravel: false,
  apy: autofarmApyAllItems,
  url: "https://autofarm.network/",
};
