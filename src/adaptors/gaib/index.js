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
const DAY = 24 * 60 * 60;
const APY_LOOKBACK_DAYS = 30;

const poolsFunction = async () => {
  const timestamp30d = Math.floor(Date.now() / 1000) - APY_LOOKBACK_DAYS * DAY;
  const block30d = (
    await utils.getData(`https://coins.llama.fi/block/ethereum/${timestamp30d}`)
  ).height;

  const [
    totalAssetsNowRes,
    totalSupplyNowRes,
    totalAssets30dRes,
    totalSupply30dRes,
    assetDecimalsRes,
    { pricesByAddress },
  ] = await Promise.all([
    sdk.api.abi.call({
      abi: "uint256:totalAssets",
      target: SAID_VAULT,
      chain: "ethereum",
    }),
    sdk.api.abi.call({
      abi: "erc20:totalSupply",
      target: SAID_VAULT,
      chain: "ethereum",
    }),
    sdk.api.abi.call({
      abi: "uint256:totalAssets",
      target: SAID_VAULT,
      chain: "ethereum",
      block: block30d,
    }),
    sdk.api.abi.call({
      abi: "erc20:totalSupply",
      target: SAID_VAULT,
      chain: "ethereum",
      block: block30d,
    }),
    sdk.api.abi.call({
      abi: "erc20:decimals",
      target: AID_TOKEN,
      chain: "ethereum",
    }),
    utils.getPrices([AID_TOKEN], "ethereum"),
  ]);

  const totalAssetsNow = Number(totalAssetsNowRes.output);
  const totalSupplyNow = Number(totalSupplyNowRes.output);
  const totalAssets30d = Number(totalAssets30dRes.output);
  const totalSupply30d = Number(totalSupply30dRes.output);
  const assetDecimals = Number(assetDecimalsRes.output);
  const assetPrice = pricesByAddress[AID_TOKEN.toLowerCase()] ?? 0;

  const tvlUsd = (totalAssetsNow / 10 ** assetDecimals) * assetPrice;

  // Annualize return from the last 30d NAV change (instead of since inception).
  const navNow = totalSupplyNow > 0 ? totalAssetsNow / totalSupplyNow : 0;
  const nav30d = totalSupply30d > 0 ? totalAssets30d / totalSupply30d : 0;
  const apyBase =
    navNow > 0 && nav30d > 0
      ? ((navNow / nav30d) ** (365.25 / APY_LOOKBACK_DAYS) - 1) * 100
      : 0;

  return [
    {
      pool: `${SAID_VAULT}-ethereum`.toLowerCase(),
      chain: utils.formatChain("ethereum"),
      project: "gaib",
      symbol: utils.formatSymbol("sAID"),
      tvlUsd,
      apyBase,
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
