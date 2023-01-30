const { api2 } = require("@defillama/sdk3");
const { aprToApy, getBlocksByTime, getPrices } = require("../utils");

const config = {
  ethereum: {
    auditor: "0x310A2694521f75C7B2b64b5937C16CE65C3EFE01",
  },
};
const url = "https://app.exact.ly";
const INTERVAL = 86_400 * 7 * 4;

const apy = async () =>
  Promise.all(
    Object.entries(config).map(async ([chain, { auditor }]) => {
      const timestampNow = Math.floor(Date.now() / 1_000);
      const timestamp24hsAgo = timestampNow - 86_400;
      /** @type {[number, number]} */
      const [startBlock, endBlock] = await getBlocksByTime([timestamp24hsAgo, timestampNow], chain);
      /** @type {string[]} */
      const markets = await api2.abi.call({ target: auditor, abi: abis.allMarkets, block: startBlock, chain });

      /** @type number[] */
      const adjustFactors = (
        await api2.abi.multiCall({
          abi: abis.marketsData,
          calls: markets.map((market) => ({ target: auditor, params: [market] })),
          chain,
          block: endBlock,
        })
      ).map(([adjustFactor]) => adjustFactor);

      /** @type [assets: string[], decimals: number[], maxFuturePools: number[], prevTotalAssets: number[], prevTotalSupply: number[],
      prevTotalFloatingBorrowAssets: number[], prevTotalFloatingBorrowShares: number[], totalAssets: number[], totalSupply: number[],
      totalFloatingBorrowAssets: number[], totalFloatingBorrowShares: number[], previewFloatingAssetsAverages: number[],
      backupFeeRates: number[], interestRateModels: number[] ] */
      const [
        assets,
        decimals,
        maxFuturePools,
        prevTotalAssets,
        prevTotalSupply,
        prevTotalFloatingBorrowAssets,
        prevTotalFloatingBorrowShares,
        totalAssets,
        totalSupply,
        totalFloatingBorrowAssets,
        totalFloatingBorrowShares,
        previewFloatingAssetsAverages,
        backupFeeRates,
        interestRateModels,
      ] = await Promise.all([
        ...[
          "asset",
          "decimals",
          "maxFuturePools",
          "totalAssets",
          "totalSupply",
          "totalFloatingBorrowAssets",
          "totalFloatingBorrowShares",
        ].map((key) => api2.abi.multiCall({ abi: abis[key], calls: markets, chain, block: startBlock })),
        ...[
          "totalAssets",
          "totalSupply",
          "totalFloatingBorrowAssets",
          "totalFloatingBorrowShares",
          "previewFloatingAssetsAverage",
          "backupFeeRate",
          "interestRateModel",
        ].map((key) => api2.abi.multiCall({ abi: abis[key], calls: markets, chain, block: endBlock })),
      ]);

      /** @type string[] */
      const symbols = await api2.abi.multiCall({ abi: abis.symbol, calls: assets, chain, block: endBlock });

      const { pricesByAddress } = await getPrices(assets, chain);
      const minMaturity = timestampNow - (timestampNow % INTERVAL) + INTERVAL;

      return Promise.all(
        markets.map(async (market, i) => {
          /** @type {number} */
          const usdUnitPrice = pricesByAddress[assets[i].toLowerCase()];
          const poolMetadata = {
            chain,
            project: "exactly",
            /** @type {string} */
            symbol: symbols[i],
            tvlUsd: ((totalAssets[i] - totalFloatingBorrowAssets[i]) * usdUnitPrice) / 10 ** decimals[i],
            /** @type {string[]} */
            underlyingTokens: [assets[i]],
            url: `${url}/${symbols[i]}`,
            ltv: adjustFactors[i] / 1e18,
          };
          const shareValue = (totalAssets[i] * 1e18) / totalSupply[i];
          const prevShareValue = (prevTotalAssets[i] * 1e18) / prevTotalSupply[i];
          const proportion = (shareValue * 1e18) / prevShareValue;
          const apr = (proportion / 1e18 - 1) * 365 * 100;
          const borrowShareValue = (totalFloatingBorrowAssets[i] * 1e18) / totalFloatingBorrowShares[i];
          const prevBorrowShareValue = (prevTotalFloatingBorrowAssets[i] * 1e18) / prevTotalFloatingBorrowShares[i];
          const borrowProportion = (borrowShareValue * 1e18) / prevBorrowShareValue;
          const borrowApr = (borrowProportion / 1e18 - 1) * 365 * 100;

          /** @type {Pool} */
          const floating = {
            ...poolMetadata,
            pool: `${market}-${chain}`.toLowerCase(),
            apy: aprToApy(apr),
            apyBaseBorrow: aprToApy(borrowApr),
            totalSupplyUsd: (totalSupply[i] * usdUnitPrice) / 10 ** decimals[i],
            totalBorrowUsd: (totalFloatingBorrowAssets[i] * usdUnitPrice) / 10 ** decimals[i],
          };

          const maturities = Array.from({ length: maxFuturePools[i] }, (_, j) => minMaturity + INTERVAL * j);
          /** @type FixedPool[] */
          const fixedPools = await api2.abi.multiCall({
            abi: abis.fixedPools,
            calls: maturities.map((maturity) => ({ target: market, params: [maturity] })),
            chain,
            block: endBlock,
          });

          /** @type {Pool[]} */
          const fixed = await Promise.all(
            maturities.map(async (maturity, j) => {
              const { borrowed, supplied, unassignedEarnings } = fixedPools[j];
              const depositRate =
                borrowed - Math.min(borrowed, supplied) > 0
                  ? (unassignedEarnings * (1e18 - backupFeeRates[i])) / (borrowed - Math.min(borrowed, supplied))
                  : 0;

              const secsToMaturity = maturity - timestampNow;
              const fixedDepositAPR = (31_536_000 * depositRate) / secsToMaturity / 1e16;

              const { rate: minFixedRate } = await api2.abi.call({
                target: interestRateModels[i],
                abi: abis.minFixedRate,
                params: [borrowed, supplied, previewFloatingAssetsAverages[i]],
                block: endBlock,
                chain,
              });

              const fixedBorrowAPR = previewFloatingAssetsAverages[i] + supplied > 0 ? minFixedRate / 1e16 : 0;

              /** @type {Pool} */
              return {
                ...poolMetadata,
                pool: `${market}-${chain}-${new Date(maturity * 1_000).toISOString()}`.toLowerCase(),
                apy: aprToApy(fixedDepositAPR, secsToMaturity / 86_400),
                apyBaseBorrow: aprToApy(fixedBorrowAPR, secsToMaturity / 86_400),
                totalSupplyUsd: (supplied * usdUnitPrice) / 10 ** decimals[i],
                totalBorrowUsd: (borrowed * usdUnitPrice) / 10 ** decimals[i],
              };
            })
          );

          return [floating, ...fixed];
        })
      );
    })
  ).then((pools) => pools.flat(2));

module.exports = {
  apy,
  url,
};

const abis = {
  allMarkets: "function allMarkets() view returns (address[])",
  asset: "function asset() view returns (address)",
  decimals: "function decimals() view returns (uint256)",
  symbol: "function symbol() view returns (string)",
  totalAssets: "function totalAssets() view returns (uint256)",
  totalFloatingBorrowAssets: "function totalFloatingBorrowAssets() view returns (uint256)",
  totalFloatingBorrowShares: "function totalFloatingBorrowShares() view returns (uint256)",
  totalSupply: "function totalSupply() view returns (uint256)",
  maxFuturePools: "function maxFuturePools() view returns (uint8)",
  fixedPools:
    "function fixedPools(uint256) view returns (uint256 borrowed, uint256 supplied, uint256 unassignedEarnings, uint256)",
  previewFloatingAssetsAverage: "function previewFloatingAssetsAverage() view returns (uint256)",
  backupFeeRate: "function backupFeeRate() view returns (uint256)",
  interestRateModel: "function interestRateModel() view returns (address)",
  minFixedRate: "function minFixedRate(uint256, uint256, uint256) view returns (uint256 rate, uint256)",
  marketsData: "function markets(address) view returns (uint128, uint8, uint8, bool, address)",
};

/** @typedef {{ pool: string, chain: string, project: string, symbol: string, tvlUsd: number, apyBase?: number, apyReward?: number, rewardTokens?: Array<string>, underlyingTokens?: Array<string>, poolMeta?: string, url?: string, apyBaseBorrow?: number, apyRewardBorrow?: number, totalSupplyUsd?: number, totalBorrowUsd?: number, ltv?: number }} Pool */
/** @typedef {{ borrowed: number, supplied: number, unassignedEarnings: number }} FixedPool */
