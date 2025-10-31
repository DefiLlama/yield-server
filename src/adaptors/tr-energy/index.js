
const axios = require("axios");


async function getConfig() {
  const { data } = await axios.get("https://core.tr.energy/api/config");
  return data.data;
}
async function getStats() {
  const { data } = await axios.get("https://core.tr.energy/api/energy-stats");
  return data.data;
}

async function getTrxPrice() {
  const { data } = await axios.get('https://coins.llama.fi/prices/current/coingecko:tron')
  return data.coins
}


async function apy() {
  const cfg   = await getConfig();
  const stats = await getStats();
  const trxPrice = await getTrxPrice();

  // TVL
  const tvlTrx = Number((stats.total_energy / cfg.trx_staking_energy_rate).toFixed(2));
  const tvlUsd = Number((tvlTrx * trxPrice['coingecko:tron'].price).toFixed(2));

  // APY  (profit_percent + static_percent) * percent_cef
  const baseApy = Number(((cfg.profit_percent + cfg.static_percent) * 100).toFixed(2));
  
  return [
    {
      pool: "trenergy-trx",
      chain: "Tron",
      project: "tr-energy",
      symbol: "TRX",
      tvlUsd,
      apyBase: baseApy,
      underlyingTokens: ["TRX"],
      url: "https://tr.energy",
    },
  ];
}

module.exports = {
  timetravel: false,
  apy,
  url: "https://tr.energy",
}
