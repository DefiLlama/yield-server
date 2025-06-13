const axios = require("axios");
const { getTrxPrice } = require("../../utils");

async function tvl() {
  try {
    const stats = await axios.get("https://core.tr.energy/api/energy-stats");
    const trxPrice = await getTrxPrice();

    const totalEnergy = stats.data.data.total_energy;
    const tvlInTrx = totalEnergy / 10.52;
    const tvlInUsd = tvlInTrx * trxPrice;

    return {
      tron: tvlInUsd
    };
  } catch (error) {
    console.error("Failed to fetch TR.ENERGY TVL data:", error);
    return {};
  }
}

module.exports = {
  timetravel: false,
  misrepresentedTokens: true,
  tron: {
    tvl,
  },
  methodology:
    "TVL is calculated as the total amount of delegated energy divided by the coefficient 10.52 (representing the TRX-to-energy rate). The resulting TRX value is then converted to USD using the TRX price obtained from https://core.tr.energy/api/config",
};
