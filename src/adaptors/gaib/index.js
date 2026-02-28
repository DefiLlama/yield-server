// DefiLlama Yield Adapter for sAID
// Repo: DefiLlama/yield-server
// Path: src/adaptors/gaib/index.js
//
// Lists sAID on the DefiLlama Yields dashboard.
// sAID is an ERC-4626 vault token. Yield from AI infra financing + T-bills.
// NAV updates monthly. Net APR ~11.85% (after 20% protocol fee).

const sdk = require("@defillama/sdk");
const utils = require("../utils");

const SAID_VAULT = "0xB3B3c527BA57cd61648e2EC2F5e006A0B390A9F8";
const AID_TOKEN = "0x18F52B3fb465118731d9e0d276d4Eb3599D57596";

const poolsFunction = async () => {
  const totalAssets = (
    await sdk.api.abi.call({
      abi: "uint256:totalAssets",
      target: SAID_VAULT,
      chain: "ethereum",
    })
  ).output;

  const totalSupply = (
    await sdk.api.abi.call({
      abi: "erc20:totalSupply",
      target: SAID_VAULT,
      chain: "ethereum",
    })
  ).output;

  const tvlUsd = Number(totalAssets) / 1e18;

  // Compute APY from on-chain NAV growth
  const nav = Number(totalAssets) / Number(totalSupply);
  const startDate = new Date("2025-12-01");
  const now = new Date();
  const daysSinceStart = (now - startDate) / (1000 * 60 * 60 * 24);

  const cumulativeReturn = nav - 1;
  const apyBase =
    daysSinceStart > 0
      ? ((1 + cumulativeReturn) ** (365.25 / daysSinceStart) - 1) * 100
      : 0;

  return [
    {
      pool: `${SAID_VAULT}-ethereum`.toLowerCase(),
      chain: utils.formatChain("ethereum"),
      project: "gaib",
      symbol: utils.formatSymbol("sAID"),
      tvlUsd,
      apyBase, // Net yield to sAID holders (~11.85% currently)
      underlyingTokens: [AID_TOKEN],
      poolMeta: "30d withdrawal cycle",
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: "https://aid.gaib.ai",
};
