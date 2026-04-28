const axios = require("axios");
const sdk = require("@defillama/sdk");

const utils = require("../utils");
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const poolAbi = require("./poolAbi");

// HypurrFi Pooled Lending (Aave V3 fork) on Hyperliquid L1
const POOL = "0xceCcE0EB9DD2Ef7996e01e25DD70e461F918A14b";
const chain = "hyperliquid";
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

// Aave reserve rates are ray-scaled annual APR values.
// Convert APR -> APY using per-second compounding to match app display.
const aprRayToApyPercent = (rateRay) => {
  const apr = Number(rateRay) / 1e27;
  if (!Number.isFinite(apr) || apr <= 0) return 0;
  return (Math.pow(1 + apr / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1) * 100;
};

const extractConfigBits = (configData) => {
  const data = BigInt(configData);
  const ltv = Number(data & 0xFFFFn);
  const active = Boolean((data >> 56n) & 1n);
  const frozen = Boolean((data >> 57n) & 1n);
  const borrowingEnabled = Boolean((data >> 58n) & 1n);
  const paused = Boolean((data >> 60n) & 1n);
  return { ltv, borrowable: active && !frozen && borrowingEnabled && !paused };
};

const apy = async () => {
  // 1. Get reserves list from Pool contract
  const reservesList = (
    await sdk.api.abi.call({
      target: POOL,
      abi: poolAbi.find((m) => m.name === "getReservesList"),
      chain,
    })
  ).output;

  // 2. Get reserve data for each asset
  const reserveDataResults = (
    await sdk.api.abi.multiCall({
      calls: reservesList.map((asset) => ({
        target: POOL,
        params: [asset],
      })),
      abi: poolAbi.find((m) => m.name === "getReserveData"),
      chain,
    })
  ).output.map((o) => o.output);

  // 3. Get token metadata
  const [symbols, decimals] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({ target: t })),
      abi: "erc20:symbol",
      chain,
    }),
    sdk.api.abi.multiCall({
      calls: reservesList.map((t) => ({ target: t })),
      abi: "erc20:decimals",
      chain,
    }),
  ]);

  const symbolResults = symbols.output.map((o) => o.output);
  const decimalResults = decimals.output.map((o) => o.output);

  // 4. Get aToken addresses and their total supply + underlying balances
  const aTokenAddresses = reserveDataResults.map((r) => r.aTokenAddress);

  const [aTokenSupply, underlyingBalances] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: aTokenAddresses.map((t) => ({ target: t })),
      abi: "erc20:totalSupply",
      chain,
    }),
    sdk.api.abi.multiCall({
      calls: aTokenAddresses.map((t, i) => ({
        target: reservesList[i],
        params: [t],
      })),
      abi: "erc20:balanceOf",
      chain,
    }),
  ]);

  const aTokenSupplyResults = aTokenSupply.output.map((o) => o.output);
  const underlyingBalanceResults = underlyingBalances.output.map(
    (o) => o.output
  );

  // 5. Prices
  const priceKeys = reservesList.map((t) => `${chain}:${t}`).join(",");
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`, {
      timeout: 30_000,
    })
  ).data.coins;

  // 6. Build pool objects
  const pools = reservesList
    .map((asset, i) => {
      const price = prices[`${chain}:${asset}`]?.price;
      if (!price) return null;

      const dec = Number(decimalResults[i]);
      const supply = aTokenSupplyResults[i] / 10 ** dec;
      const totalSupplyUsd = supply * price;
      const available = underlyingBalanceResults[i] / 10 ** dec;
      const tvlUsd = available * price;
      const totalBorrowUsd = totalSupplyUsd - tvlUsd;

      const apyBase = aprRayToApyPercent(
        reserveDataResults[i].currentLiquidityRate
      );
      const apyBaseBorrow = aprRayToApyPercent(
        reserveDataResults[i].currentVariableBorrowRate
      );

      const { ltv, borrowable } = extractConfigBits(
        reserveDataResults[i].configuration.data
      );

      return {
        pool: `${aTokenAddresses[i]}-hypurrfi-pooled`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: "hypurrfi-pooled",
        symbol: utils.formatSymbol(symbolResults[i]),
        tvlUsd,
        apyBase,
        underlyingTokens: [asset],
        totalSupplyUsd,
        totalBorrowUsd,
        debtCeilingUsd: null,
        apyBaseBorrow,
        ltv: ltv / 10000,
        url: `https://hypurrfi.com/markets/pooled/999/${asset}`,
        borrowable,
        mintedCoin: null,
        poolMeta: null,
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
