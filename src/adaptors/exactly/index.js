const { api2 } = require("@defillama/sdk");
const { AddressZero } = require("@ethersproject/constants");
const { aprToApy, getBlocksByTime, getPrices } = require("../utils");

// Exactly Markets have one variable debt leg and several fixed maturity debt
// legs for the same underlying asset. Standard rows carry those borrow-side
// metrics: one row for the variable market and one row per fixed maturity. The
// Auditor defines collateral eligibility at the collateral Market -> debt Market
// level, not per maturity, so all debt rows for a Market share `routeGroupKey`.
// `routing_collateral` rows are pure collateral/debt edges; they link back to
// the collateral variable Market state with `underlyingStateKey` and avoid
// duplicating supply APY/TVL on every route.
const config = {
  optimism: {
    auditor: "0xaEb62e6F27BC103702E7BC879AE98bceA56f027E",
  },
};
const url = "https://app.exact.ly";
const INTERVAL = 86_400 * 7 * 4;
const WAD = 10n ** 18n;
const getMarketKey = (market) => market.toLowerCase();
const getRoutePoolId = (collateralMarket, debtMarket, chain) =>
  `${collateralMarket}-${debtMarket}-${chain}`.toLowerCase();
const toUsd = (amount, price, baseUnit) => (Number(amount) * price) / baseUnit;

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

      /** @type [assets: string[], decimals: number[], maxFuturePools: number[], prevTotalAssets: string[], prevTotalSupply: string[], prevTotalFloatingBorrowAssets: string[], prevTotalFloatingBorrowShares: string[], totalAssets: string[], totalSupply: string[], totalFloatingBorrowAssets: string[], totalFloatingBorrowShares: string[], previewFloatingAssetsAverages: string[], backupFeeRates: bigint[], interestRateModels: number[], floatingBackupBorrowed: string[], reserveFactors: string[], frozen: (boolean | null)[] ] */
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
        floatingBackupBorrowed,
        reserveFactors,
        frozen,
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
          "floatingBackupBorrowed",
          "reserveFactor",
        ].map((key) => api2.abi.multiCall({ abi: abis[key], calls: markets, chain, block })),
        api2.abi.multiCall({ abi: abis.isFrozen, calls: markets, chain, block, permitFailure: true }),
      ]);

      /** @type string[] */
      const symbols = await api2.abi.multiCall({ abi: abis.symbol, calls: assets, chain, block });

      const { pricesByAddress } = await getPrices(assets, chain);
      const minMaturity = timestampNow - (timestampNow % INTERVAL) + INTERVAL;

      return Promise.all(
        markets.map(async (market, i) => {
          if (frozen[i]) return [];

          /** @type {number} */
          const usdUnitPrice = pricesByAddress[assets[i].toLowerCase()];
          const poolMetadata = {
            chain,
            project: "exactly",
            /** @type {string} */
            symbol: symbols[i],
            tvlUsd: 0,
            /** @type {string[]} */
            underlyingTokens: [assets[i]],
            url: `${url}/${symbols[i]}`,
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

          const maturities = Array.from({ length: maxFuturePools[i] }, (_, j) => minMaturity + INTERVAL * j);
          /** @type FixedPool[] */
          const fixedPools = await api2.abi.multiCall({
            abi: abis.fixedPools,
            calls: maturities.map((maturity) => ({ target: market, params: [maturity] })),
            chain,
            block,
          });
          const reserveAdjustedFloatingAssets =
            (BigInt(totalAssets[i]) * (WAD - BigInt(reserveFactors[i]))) / WAD;
          const floatingDebtAssets = BigInt(totalFloatingBorrowAssets[i]);
          const floatingBackupAssets = BigInt(floatingBackupBorrowed[i]);
          const floatingAvailableBorrowAssets =
            reserveAdjustedFloatingAssets > floatingDebtAssets + floatingBackupAssets
              ? reserveAdjustedFloatingAssets - floatingDebtAssets - floatingBackupAssets
              : 0n;
          const floatingSupplyUsd = toUsd(BigInt(totalAssets[i]), usdUnitPrice, baseUnit);
          const floatingBorrowUsd = toUsd(floatingDebtAssets, usdUnitPrice, baseUnit);
          const floatingAvailableBorrowUsd = toUsd(floatingAvailableBorrowAssets, usdUnitPrice, baseUnit);
          const getFixedAvailableBorrowAssets = ({ borrowed, supplied }) => {
            const fixedBorrowedAssets = BigInt(borrowed);
            const fixedSuppliedAssets = BigInt(supplied);
            const fixedPoolLiquidity =
              fixedSuppliedAssets > fixedBorrowedAssets ? fixedSuppliedAssets - fixedBorrowedAssets : 0n;
            return fixedPoolLiquidity + floatingAvailableBorrowAssets;
          };
          const debtRouteGroupKey = getMarketKey(market);

          const buildCollateralRoutes = () =>
            markets
              .map((collateralMarket, j) => {
                if (frozen[j]) return null;

                const collateralUsdUnitPrice = pricesByAddress[assets[j].toLowerCase()];
                const ltv = (adjustFactors[j] / 1e18) * (adjustFactors[i] / 1e18);
                if (!Number.isFinite(collateralUsdUnitPrice) || ltv <= 0) return null;

                return {
                  chain,
                  project: "exactly",
                  pool: getRoutePoolId(collateralMarket, market, chain),
                  poolKind: "routing_collateral",
                  routeGroupKey: debtRouteGroupKey,
                  underlyingStateKey: getMarketKey(collateralMarket),
                  symbol: symbols[j],
                  token: null,
                  poolMeta: `${symbols[j]}/${symbols[i]}`,
                  underlyingTokens: [assets[j]],
                  borrowToken: assets[i],
                  ltv,
                  url: `${url}/${symbols[i]}`,
                };
              })
              .filter(Boolean);

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
              routeGroupKey: debtRouteGroupKey,
              underlyingStateKey: debtRouteGroupKey,
              poolMeta: "Variable Rate",
              apyBase: aprToApy(apr),
              apyBaseBorrow: aprToApy(borrowAPR),
              borrowToken: assets[i],
              borrowable: floatingAvailableBorrowUsd > 0,
              ltv: 0,
              tvlUsd: floatingAvailableBorrowUsd,
              ...(shareValue / 1e18 > 0 && { pricePerShare: shareValue / 1e18 }),
              totalSupplyUsd: floatingSupplyUsd,
              totalBorrowUsd: floatingBorrowUsd,
              availableBorrowUsd: floatingAvailableBorrowUsd,
              rewardTokens,
              apyReward: aprReward ? aprToApy(aprReward) : undefined,
              apyRewardBorrow: aprRewardBorrow ? aprToApy(aprRewardBorrow) : undefined,
            };

          /** @type {Pool[]} */
          const fixed = await Promise.all(
            maturities.map(async (maturity, j) => {
              const { borrowed, supplied, unassignedEarnings, lastAccrual } = fixedPools[j];

              const fixBorrowed = BigInt(borrowed),
                fixSupplied = BigInt(supplied),
                fixUnassignedEarnings = BigInt(unassignedEarnings);

              if (fixSupplied + BigInt(previewFloatingAssetsAverages[i]) === 0n) return;

              const fixedBorrowRate = await api2.abi.call({
                target: interestRateModels[i],
                abi: abis.fixedBorrowRate,
                params: [maturity, 0, borrowed, supplied, previewFloatingAssetsAverages[i]],
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
              const maturityDate = new Date(maturity * 1_000).toISOString().slice(0, 10);
              const poolMeta = `Fixed mat: ${maturityDate}`;
              const fixedAvailableBorrowAssets = getFixedAvailableBorrowAssets({ borrowed, supplied });
              const fixedAvailableBorrowUsd = toUsd(fixedAvailableBorrowAssets, usdUnitPrice, baseUnit);
              const fixedBorrowAPR = (Number(fixedBorrowRate) / 1e16) * ((365 * 86_400) / secsToMaturity);

              /** @type {Pool} */
              const fixedPool = {
                ...poolMetadata,
                pool: `${market}-${chain}-${maturityDate}`.toLowerCase(),
                routeGroupKey: debtRouteGroupKey,
                poolMeta,
                tvlUsd: fixedAvailableBorrowUsd,
                apyBase: aprToApy(fixedDepositAPR, secsToMaturity / 86_400),
                apyBaseBorrow: aprToApy(fixedBorrowAPR, secsToMaturity / 86_400),
                borrowToken: assets[i],
                borrowable: fixedAvailableBorrowUsd > 0,
                totalSupplyUsd: toUsd(fixSupplied, usdUnitPrice, baseUnit),
                totalBorrowUsd: toUsd(fixBorrowed, usdUnitPrice, baseUnit),
                availableBorrowUsd: fixedAvailableBorrowUsd,
                ltv: 0,
                rewardTokens,
                apyRewardBorrow: aprRewardBorrow ? aprToApy(aprRewardBorrow, secsToMaturity / 86_400) : undefined,
              };

              return fixedPool;
            })
          );

          return [
            floating,
            ...buildCollateralRoutes(),
            ...fixed.flat(),
          ].filter(Boolean);
        })
      );
    })
  ).then((pools) => pools.flat(2));

module.exports = {
  protocolId: '2385',
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
  floatingBackupBorrowed: "function floatingBackupBorrowed() view returns (uint256)",
  reserveFactor: "function reserveFactor() view returns (uint128)",
  isFrozen: "function isFrozen() view returns (bool)",
  fixedBorrowRate:
    "function fixedBorrowRate(uint256 maturity, uint256 amount, uint256 borrowed, uint256 supplied, uint256 backupAssets) view returns (uint256)",
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
};

/** @typedef {{ pool: string, chain: string, project: string, symbol: string, tvlUsd: number, apy?: number, apyBase?: number, apyReward?: number, rewardTokens?: Array<string>, underlyingTokens?: Array<string>, poolMeta?: string, url?: string, routeGroupKey?: string, underlyingStateKey?: string, poolKind?: string, borrowToken?: string, borrowable?: boolean, availableBorrowUsd?: number, apyBaseBorrow?: number, apyRewardBorrow?: number, totalSupplyUsd?: number, totalBorrowUsd?: number, ltv?: number }} Pool */
/** @typedef {{ borrowed: string, supplied: string, unassignedEarnings: string, lastAccrual: number }} FixedPool */
