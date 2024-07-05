const utils = require('../utils');

const buildPool = (entry, chain) => {
  const asset = entry.name;
  const symbol = entry.symbol;

  const newObj = {
    pool: `${entry.name} (${chain})`,
    chain: chain,
    project: 'vertex',
    symbol: utils.formatSymbol(symbol),
    tvlUsd: entry.tvl,
    apy: Number(entry.deposit_apr) * 100,
  };

  return newObj;
};

const topLvl = async () => {
  const chainUrls = [
    {
        chain: "arbitrum",
        url: "https://gateway.prod.vertexprotocol.com/v2/apr"
    },
    {
        chain: "mantle",
        url: "https://gateway.mantle-prod.vertexprotocol.com/v2/apr"
    }
  ]
  let assetsToSkip = [41, 113]
  let pools = [];
  for (chainUrl of chainUrls) {
    let data = await utils.getData(chainUrl.url);
    let chain = chainUrl.chain;
    for (entry of data) {
        if (assetsToSkip.includes(entry.product_id)) continue
        pools.push(buildPool(entry, chain))
    }
  }
  return [...pools];
};

const main = async () => {
  const data = await topLvl();
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.vertexprotocol.com/money-markets',
};