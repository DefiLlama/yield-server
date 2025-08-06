
const axios = require("axios");


async function getConfig() {
  const { data } = await axios.get("https://core.tr.energy/api/config");
  return data.data;
}
async function getStats() {
  const { data } = await axios.get("https://core.tr.energy/api/energy-stats");
  return data.data;
}


async function apy() {
  const cfg   = await getConfig();
  const stats = await getStats();

  // TVL
  const tvlTrx = stats.total_energy / cfg.trx_staking_energy_rate;
  const tvlUsd = tvlTrx * cfg.trx_usd_rate;

  // APY  (profit_percent + static_percent) * percent_cef
  const baseApy = (cfg.profit_percent + cfg.static_percent) * cfg.percent_cef * 100;

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
