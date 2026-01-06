const axios = require("axios");

// Kerne Protocol Yield Adapter for DefiLlama
// VAULT_ADDRESS: 0x5FD0F7eA40984a6a8E9c6f6BDfd297e7dB4448Bd
// ASSET: WETH (0x4200000000000000000000000000000000000006)

const VAULT_ADDRESS = "0x5FD0F7eA40984a6a8E9c6f6BDfd297e7dB4448Bd";
const WETH_ADDRESS = "0x4200000000000000000000000000000000000006";

async function apy() {
  // This function is used by DefiLlama Yields to track APY over time
  // It pulls from our public stats API which reflects the bot's actual performance
  const response = await axios.get("https://kerne.finance/api/stats");
  const data = response.data;
  
  return [
    {
      pool: `${VAULT_ADDRESS}-base`,
      chain: "Base",
      project: "kerne-protocol",
      symbol: "kLP",
      tvlUsd: parseFloat(data.tvl_usd),
      apyBase: parseFloat(data.current_apy),
      underlyingTokens: [WETH_ADDRESS],
      rewardTokens: [], // Kerne yield is auto-compounding in kLP price
      url: "https://kerne.finance/terminal"
    }
  ];
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: "https://kerne.finance",
};
