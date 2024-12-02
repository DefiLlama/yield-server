const { api2 } = require("@defillama/sdk");
const { AddressZero } = require("@ethersproject/constants");
const { aprToApy, getBlocksByTime, getPrices } = require("../utils");

const config = {
  ethereum: {
    auditor: "0x310A2694521f75C7B2b64b5937C16CE65C3EFE01",
  },
  optimism: {
    auditor: "0xaEb62e6F27BC103702E7BC879AE98bceA56f027E",
  },
};
const url = "https://app.exact.ly";
const INTERVAL = 86_400 * 7 * 4;
const WAD = 10n ** 18n;

const apy = async () =>
  Promise.all(
    Object.entries(config).map(async ([chain, { auditor }]) => {
      const timestampNow = Math.floor(Date.now() / 1_000);
      const timestamp24hsAgo = timestampNow - 86_400;
      /** @type {[number, number]} */
      const [startBlock, block] = await getBlocksByTime([timestamp24hsAgo, timestampNow], chain);
      /** @type {string[]} */
      const markets = await api2.abi.call({ target: auditor, abi: abis.allMarkets, block: startBlock, chain });

      /** @type number[] */
      const adjustFactors = (
        await api2.abi.multiCall({
          abi: abis.marketsData,
          calls: markets.map((market) => ({ target: auditor, params: [market] })),
          chain,
          block,
        })
      ).map(([adjustFactor]) => adjustFactor);

      /** @type [assets: string[], decimals: number[], maxFuturePools: number[], prevTotalAssets: string[], prevTotalSupply: string[], prevTotalFloatingBorrowAssets: string[], prevTotalFloatingBorrowShares: string[], totalAssets: string[], totalSupply: string[], totalFloatingBorrowAssets: string[], totalFloatingBorrowShares: string[], previewFloatingAssetsAverages: string[], backupFeeRates: bigint[], interestRateModels: number[], reserveFactors: string[] ] */
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
        reserveFactors,
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
          "reserveFactor",
        ].map((key) => api2.abi.multiCall({ abi: abis[key], calls: markets, chain, block })),
      ]);

      /** @type string[] */
      const symbols = await api2.abi.multiCall({ abi: abis.symbol, calls: assets, chain, block });

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
            ltv: (adjustFactors[i] / 1e18) ** 2,
          };
          const shareValue = (totalAssets[i] * 1e18) / totalSupply[i];
          const prevShareValue = (prevTotalAssets[i] * 1e18) / prevTotalSupply[i];
          const proportion = (shareValue * 1e18) / prevShareValue;
          const apr = (proportion / 1e18 - 1) * 365 * 100;
          const borrowShareValue = (totalFloatingBorrowAssets[i] * 1e18) / totalFloatingBorrowShares[i];
          const prevBorrowShareValue = (prevTotalFloatingBorrowAssets[i] * 1e18) / prevTotalFloatingBorrowShares[i];
          const borrowProportion = (borrowShareValue * 1e18) / prevBorrowShareValue;
          const borrowAPR = (borrowProportion / 1e18 - 1) * 365 * 100;
          const baseUnit = 10 ** decimals[i];

          let aprReward, aprRewardBorrow, rewardTokens;
          const controller = await api2.abi.call({ target: market, abi: abis.rewardsController, block, chain });
          if (controller !== AddressZero) {
            rewardTokens = await api2.abi.call({ target: controller, abi: abis.allRewards, block, chain });
            const { pricesByAddress: rewardsPrices } = await getPrices(rewardTokens, chain);
            /** @type [{deposit: number, borrow: number}] */
            const rates = await Promise.all(
              rewardTokens.map(async (reward) => {
                const [{ start: configStart }, { borrowIndex, depositIndex, lastUndistributed }, { start }] =
                  await Promise.all(
                    ["rewardConfig", "rewardIndexes", "distributionTime"].map((key) =>
                      api2.abi.call({ target: controller, abi: abis[key], params: [market, reward], block, chain })
                    )
                  );
                /** @type {{borrowIndex: string, depositIndex: string}} */
                const { borrowIndex: projectedBorrowIndex, depositIndex: projectedDepositIndex } = await api2.abi.call({
                  target: controller,
                  abi: abis.previewAllocation,
                  params: [market, reward, timestampNow > configStart ? 3_600 : 0],
                  block,
                  chain,
                });
                /** @type number */
                const rewardUSD = rewardsPrices[reward.toLowerCase()] ?? 0;
                const firstMaturity = configStart - (configStart % INTERVAL) + INTERVAL;
                const maxMaturity = timestampNow - (timestampNow % INTERVAL) + INTERVAL + maxFuturePools[i] * INTERVAL;
                const rewardMaturities = Array.from(
                  { length: (maxMaturity - firstMaturity) / INTERVAL },
                  (_, j) => firstMaturity + j * INTERVAL
                );
                /** @type {{borrowed: string, deposited: string}[]} */
                const fixedBalances = await api2.abi.multiCall({
                  abi: abis.fixedPoolBalance,
                  calls: rewardMaturities.map((maturity) => ({ target: market, params: [maturity] })),
                  chain,
                  block,
                });
                const fixedDebt = fixedBalances.reduce((total, { borrowed }) => total + BigInt(borrowed), 0n);
                const previewRepay = await api2.abi.call({
                  target: market,
                  abi: abis.previewRepay,
                  params: [String(fixedDebt)],
                  block,
                  chain,
                });
                return {
                  borrow:
                    totalFloatingBorrowAssets[i] + fixedDebt > 0
                      ? (projectedBorrowIndex - borrowIndex) *
                        ((totalFloatingBorrowShares[i] + previewRepay) / baseUnit) *
                        (rewardUSD / 1e18) *
                        (baseUnit / (((totalFloatingBorrowAssets[i] + fixedDebt) * usdUnitPrice) / 1e18)) *
                        (365 * 24)
                      : 0,
                  deposit:
                    totalAssets[i] > 0
                      ? (projectedDepositIndex - depositIndex) *
                        (totalSupply[i] / baseUnit) *
                        (rewardUSD / 1e18) *
                        (baseUnit / ((totalAssets[i] * usdUnitPrice) / 1e18)) *
                        (365 * 24)
                      : 0,
                };
              })
            );
            aprReward = rates.reduce((sum, { deposit }) => sum + deposit, 0) / 1e16;
            aprRewardBorrow = rates.reduce((sum, { borrow }) => sum + borrow, 0) / 1e16;
          }

          /** @type {Pool} */
          const floating = Number.isFinite(apr) &&
            Number.isFinite(borrowAPR) && {
              ...poolMetadata,
              pool: `${market}-${chain}`.toLowerCase(),
              apyBase: aprToApy(apr),
              apyBaseBorrow: aprToApy(borrowAPR),
              totalSupplyUsd: (totalSupply[i] * usdUnitPrice) / baseUnit,
              totalBorrowUsd: (totalFloatingBorrowAssets[i] * usdUnitPrice) / baseUnit,
              rewardTokens,
              apyReward: aprReward ? aprToApy(aprReward) : undefined,
              apyRewardBorrow: aprRewardBorrow ? aprToApy(aprRewardBorrow) : undefined,
            };

          const maturities = Array.from({ length: maxFuturePools[i] }, (_, j) => minMaturity + INTERVAL * j);
          /** @type FixedPool[] */
          const fixedPools = await api2.abi.multiCall({
            abi: abis.fixedPools,
            calls: maturities.map((maturity) => ({ target: market, params: [maturity] })),
            chain,
            block,
          });

          /** @type {Pool[]} */
          const fixed = await Promise.all(
            maturities.map(async (maturity, j) => {
              const { borrowed, supplied, unassignedEarnings, lastAccrual } = fixedPools[j];

              const fixBorrowed = BigInt(borrowed),
                fixSupplied = BigInt(supplied),
                fixUnassignedEarnings = BigInt(unassignedEarnings);

              if (fixSupplied + BigInt(previewFloatingAssetsAverages[i]) === 0n) return;

              const { rate: minFixedRate } = await api2.abi.call({
                target: interestRateModels[i],
                abi: abis.minFixedRate,
                params: [borrowed, supplied, previewFloatingAssetsAverages[i]],
                block,
                chain,
              });
              const unassignedEarning =
                fixUnassignedEarnings -
                (fixUnassignedEarnings * BigInt(timestampNow - lastAccrual)) /
                  BigInt(timestampNow - (timestampNow % INTERVAL) + INTERVAL * (j + 1) - lastAccrual);
              const optimalDeposit = fixBorrowed - (fixBorrowed > fixSupplied ? fixSupplied : fixBorrowed);

              const fixedDepositAPR =
                optimalDeposit > 0n
                  ? Number(
                      (31_536_000n * (((unassignedEarning * (WAD - BigInt(backupFeeRates[i]))) / WAD) * WAD)) /
                        optimalDeposit /
                        BigInt(INTERVAL * (j + 1) - (timestampNow % INTERVAL))
                    ) / 1e16
                  : 0;

              const secsToMaturity = maturity - timestampNow;
              const poolMeta = new Date(maturity * 1_000).toISOString().slice(0, 10);

              /** @type {Pool} */
              return {
                ...poolMetadata,
                pool: `${market}-${chain}-${poolMeta}`.toLowerCase(),
                poolMeta,
                apyBase: aprToApy(fixedDepositAPR, secsToMaturity / 86_400),
                apyBaseBorrow: aprToApy(minFixedRate / 1e16, secsToMaturity / 86_400),
                totalSupplyUsd:
                  (Number(
                    BigInt(supplied) +
                      (BigInt(totalSupply[i]) * (WAD - BigInt(reserveFactors[i]))) / WAD -
                      BigInt(totalFloatingBorrowAssets[i])
                  ) *
                    usdUnitPrice) /
                  baseUnit,
                totalBorrowUsd: (borrowed * usdUnitPrice) / baseUnit,
                rewardTokens,
                apyRewardBorrow: aprRewardBorrow ? aprToApy(aprRewardBorrow, secsToMaturity / 86_400) : undefined,
              };
            })
          );

          return [floating, ...fixed].filter(Boolean);
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
  allRewards: "function allRewards() view returns (address[])",
  asset: "function asset() view returns (address)",
  decimals: "function decimals() view returns (uint256)",
  symbol: "function symbol() view returns (string)",
  totalAssets: "function totalAssets() view returns (uint256)",
  totalFloatingBorrowAssets: "function totalFloatingBorrowAssets() view returns (uint256)",
  totalFloatingBorrowShares: "function totalFloatingBorrowShares() view returns (uint256)",
  totalSupply: "function totalSupply() view returns (uint256)",
  maxFuturePools: "function maxFuturePools() view returns (uint8)",
  fixedPools:
    "function fixedPools(uint256) view returns (uint256 borrowed, uint256 supplied, uint256 unassignedEarnings, uint256 lastAccrual)",
  previewFloatingAssetsAverage: "function previewFloatingAssetsAverage() view returns (uint256)",
  backupFeeRate: "function backupFeeRate() view returns (uint256)",
  interestRateModel: "function interestRateModel() view returns (address)",
  minFixedRate: "function minFixedRate(uint256, uint256, uint256) view returns (uint256 rate, uint256)",
  marketsData: "function markets(address) view returns (uint128, uint8, uint8, bool, address)",
  rewardsController: "function rewardsController() view returns (address)",
  rewardConfig:
    "function rewardConfig(address market, address reward) external view returns (address market, address reward, address priceFeed, uint32 start, uint256 distributionPeriod, uint256 targetDebt, uint256 totalDistribution, uint256 undistributedFactor, int128 flipSpeed, uint64 compensationFactor, uint64 transitionFactor, uint64 borrowAllocationWeightFactor, uint64 depositAllocationWeightAddend, uint64 depositAllocationWeightFactor)",
  rewardIndexes:
    "function rewardIndexes(address market, address reward) external view returns (uint256 borrowIndex, uint256 depositIndex, uint256 lastUndistributed)",
  previewAllocation:
    "function previewAllocation(address market, address reward, uint256 deltaTime) external view returns (uint256 borrowIndex, uint256 depositIndex, uint256 newUndistributed)",
  distributionTime:
    "function distributionTime(address market, address reward) external view returns (uint32 start, uint32 end, uint32 lastUpdate)",
  fixedPoolBalance: "function fixedPoolBalance(uint256 maturity) external view returns (uint256 borrowed, uint256)",
  previewRepay: "function previewRepay(uint256 assets) external view returns (uint256)",
  reserveFactor: "function reserveFactor() view returns (uint128)",
};

/** @typedef {{ pool: string, chain: string, project: string, symbol: string, tvlUsd: number, apyBase?: number, apyReward?: number, rewardTokens?: Array<string>, underlyingTokens?: Array<string>, poolMeta?: string, url?: string, apyBaseBorrow?: number, apyRewardBorrow?: number, totalSupplyUsd?: number, totalBorrowUsd?: number, ltv?: number }} Pool */
/** @typedef {{ borrowed: string, supplied: string, unassignedEarnings: string, lastAccrual: number }} FixedPool */
