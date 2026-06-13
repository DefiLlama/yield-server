const axios = require("axios");
const sdk = require("@defillama/sdk");

const utils = require("../utils");
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

// HypurrFi Isolated Lending (Fraxlend-style pairs) on Hyperliquid L1
const REGISTRY = "0x5aB54F5Ca61ab60E81079c95280AF1Ee864EA3e7";
const chain = "hyperliquid";
const SECONDS_PER_YEAR = 365.25 * 24 * 60 * 60;

const pairAbi = {
  getAllPairAddresses: {
    inputs: [],
    name: "getAllPairAddresses",
    outputs: [{ internalType: "address[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  asset: {
    inputs: [],
    name: "asset",
    outputs: [{ internalType: "address", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  name: {
    inputs: [],
    name: "name",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  totalAsset: {
    inputs: [],
    name: "totalAsset",
    outputs: [
      { internalType: "uint128", name: "amount", type: "uint128" },
      { internalType: "uint128", name: "shares", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  totalBorrow: {
    inputs: [],
    name: "totalBorrow",
    outputs: [
      { internalType: "uint128", name: "amount", type: "uint128" },
      { internalType: "uint128", name: "shares", type: "uint128" },
    ],
    stateMutability: "view",
    type: "function",
  },
  currentRateInfo: {
    inputs: [],
    name: "currentRateInfo",
    outputs: [
      { internalType: "uint32", name: "lastBlock", type: "uint32" },
      { internalType: "uint32", name: "feeToProtocolRate", type: "uint32" },
      { internalType: "uint64", name: "lastTimestamp", type: "uint64" },
      { internalType: "uint64", name: "ratePerSec", type: "uint64" },
      { internalType: "uint64", name: "fullUtilizationRate", type: "uint64" },
    ],
    stateMutability: "view",
    type: "function",
  },
  maxLTV: {
    inputs: [],
    name: "maxLTV",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
};

const apy = async () => {
  // 1. Get all pair addresses from registry
  const pairs = (
    await sdk.api.abi.call({
      target: REGISTRY,
      abi: pairAbi.getAllPairAddresses,
      chain,
    })
  ).output;

  // 2. Get pair data
  const [assets, names, totalAssets, totalBorrows, rateInfos, maxLTVs] =
    await Promise.all(
      [
        "asset",
        "name",
        "totalAsset",
        "totalBorrow",
        "currentRateInfo",
        "maxLTV",
      ].map((method) =>
        sdk.api.abi.multiCall({
          calls: pairs.map((p) => ({ target: p })),
          abi: pairAbi[method],
          chain,
        })
      )
    );

  const assetAddresses = assets.output.map((o) => o.output);
  const pairNames = names.output.map((o) => o.output);
  const totalAssetData = totalAssets.output.map((o) => o.output);
  const totalBorrowData = totalBorrows.output.map((o) => o.output);
  const rateInfoData = rateInfos.output.map((o) => o.output);
  const maxLTVData = maxLTVs.output.map((o) => o.output);

  // 3. Get asset metadata
  const uniqueAssets = [...new Set(assetAddresses)];
  const assetSymbols = {};
  const assetDecimals = {};

  const [symResults, decResults] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: uniqueAssets.map((a) => ({ target: a })),
      abi: "erc20:symbol",
      chain,
    }),
    sdk.api.abi.multiCall({
      calls: uniqueAssets.map((a) => ({ target: a })),
      abi: "erc20:decimals",
      chain,
    }),
  ]);

  uniqueAssets.forEach((a, i) => {
    assetSymbols[a.toLowerCase()] = symResults.output[i].output;
    assetDecimals[a.toLowerCase()] = Number(decResults.output[i].output);
  });

  // 4. Prices
  const priceKeys = uniqueAssets.map((t) => `${chain}:${t}`).join(",");
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  // 5. Build pools
  const pools = pairs
    .map((pairAddr, i) => {
      const asset = assetAddresses[i];
      const assetKey = asset.toLowerCase();
      const price = prices[`${chain}:${asset}`]?.price;
      if (!price) return null;

      const symbol = assetSymbols[assetKey];
      if (!symbol) return null;

      const dec = assetDecimals[assetKey];
      const totalSupplyAmount = Number(BigInt(totalAssetData[i].amount)) / 10 ** dec;
      const totalBorrowAmount = Number(BigInt(totalBorrowData[i].amount)) / 10 ** dec;

      const totalSupplyUsd = totalSupplyAmount * price;
      const totalBorrowUsd = totalBorrowAmount * price;
      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      // Fraxlend ratePerSec: per-second interest rate scaled by 1e18
      const ratePerSec = Number(rateInfoData[i].ratePerSec) / 1e18;

      // Use amounts (not shares) for utilization — amounts include accrued interest
      const utilizationPercent =
        totalSupplyAmount > 0
          ? (totalBorrowAmount / totalSupplyAmount) * 100
          : 0;

      const borrowApy =
        ratePerSec > 0
          ? (Math.exp(ratePerSec * SECONDS_PER_YEAR) - 1) * 100
          : 0;

      // Protocol fee rate (fraction of interest going to protocol, scaled by 1e5)
      const feeToProtocol = Number(rateInfoData[i].feeToProtocolRate);
      const protocolFeeShare = feeToProtocol / 1e5;
      const apyBase =
        borrowApy * (utilizationPercent / 100) * (1 - protocolFeeShare);
      const apyBaseBorrow = borrowApy;

      // maxLTV is scaled by 1e5 (e.g. 75000 = 75%)
      const ltv = Number(maxLTVData[i]) / 1e5;

      // Extract collateral name from pair name for poolMeta
      // Format: "hyASSET (Collateral) - N"
      const collName = pairNames[i]
        .replace(/^hy\w+\s*/, "")
        .replace(/\s*-\s*\d+$/, "")
        .replace(/[()]/g, "")
        .trim();

      return {
        pool: `${pairAddr}-hypurrfi-isolated`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: "hypurrfi-isolated",
        symbol: symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [asset],
        totalSupplyUsd,
        totalBorrowUsd,
        debtCeilingUsd: null,
        apyBaseBorrow,
        ltv,
        url: `https://hypurrfi.com/markets/isolated/999/${pairAddr}`,
        poolMeta: `Isolated - ${collName}`,
      };
    })
    .filter(Boolean)
    .filter((p) => utils.keepFinite(p));

  return addMerklRewardApy(pools, 'hypurrfi', (p) => p.pool.split('-')[0]);
};

module.exports = {
  timetravel: false,
  apy,
  url: "https://hypurrfi.com/lend",
};
