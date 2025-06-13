const axios = require("axios");

async function getTrxPrice() {
  try {
    const response = await axios.get("https://core.tr.energy/api/config");
    return response.data.data.trx_usd_rate;
  } catch (error) {
    console.error("Failed to fetch TRX price from core.tr.energy:", error);
    return 0.27; // fallback value
  }
}

module.exports = {
  getTrxPrice
};
