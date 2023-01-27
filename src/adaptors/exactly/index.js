const { util, api } = require("@defillama/sdk");
const { aprToApy, getBlocksByTime, getPrices } = require("../utils");
const { AddressZero } = require("@ethersproject/constants");

const config = {
  ethereum: {
    auditor: "0x310A2694521f75C7B2b64b5937C16CE65C3EFE01",
  },
};
const url = "https://app.exact.ly";
const INTERVAL = 86_400 * 7 * 4;

/** @type {(markets: string[], chain: string, block: number) => Promise<{ 
  previewFloatingAssetsAverages: number[];
  backupFeeRates: number[];
  interestRateModels: number[];
}>} */
const metadata = async (markets, chain, block) => {
  const [asset, decimals, maxFuturePools] = await Promise.all(
    ["asset", "decimals", "maxFuturePools"].map((key) =>
      api.abi.multiCall({
        abi: abis[key],
        calls: markets.map((target) => ({ target })),
        chain,
        block,
      })
    )
  );
  return {
    assets: asset.output.map(({ output }) => output),
    decimals: decimals.output.map(({ output }) => output),
    maxFuturePools: maxFuturePools.output.map(({ output }) => output),
  };
};

/** @type {(markets: string[], chain: string, block: number) => Promise<{ 
  totalAssets: number[]
  totalSupply: number[]
  totalFloatingBorrowAssets: number[]
  totalFloatingBorrowShares: number[]
}>} */
const totals = async (markets, chain, block) => {
  const [totalAssets, totalSupply, totalFloatingBorrowAssets, totalFloatingBorrowShares] = await Promise.all(
    ["totalAssets", "totalSupply", "totalFloatingBorrowAssets", "totalFloatingBorrowShares"].map((key) =>
      api.abi.multiCall({
        abi: abis[key],
        calls: markets.map((target) => ({ target })),
        chain,
        block,
      })
    )
  );

  return {
    totalAssets: totalAssets.output.map(({ output }) => output),
    totalSupply: totalSupply.output.map(({ output }) => output),
    totalFloatingBorrowAssets: totalFloatingBorrowAssets.output.map(({ output }) => output),
    totalFloatingBorrowShares: totalFloatingBorrowShares.output.map(({ output }) => output),
  };
};

/** @type {(markets: string[], chain: string, block: number) => Promise<{ 
  previewFloatingAssetsAverages: number[]
  backupFeeRates: number[]
  interestRateModels: number[]
}>} */
const rates = async (markets, chain, block) => {
  const [previewFloatingAssetsAverages, backupFeeRates, interestRateModels] = await Promise.all(
    ["previewFloatingAssetsAverage", "backupFeeRate", "interestRateModel"].map((key) =>
      api.abi.multiCall({
        abi: abis[key],
        calls: markets.map((target) => ({ target })),
        chain,
        block,
      })
    )
  );

  return {
    previewFloatingAssetsAverages: previewFloatingAssetsAverages.output.map(({ output }) => output),
    backupFeeRates: backupFeeRates.output.map(({ output }) => output),
    interestRateModels: interestRateModels.output.map(({ output }) => output),
  };
};

/** @type {(target: string, chain: string, block: number, maturities: number[]) => Promise<FixedPool[]>} */
const fixedPools = async (target, chain, block, maturities) => {
  const [fixedPools] = await Promise.all([
    api.abi.multiCall({
      abi: abis.fixedPools,
      calls: maturities.map((maturity) => ({ target, params: [maturity] })),
      chain,
      block,
    }),
  ]);

  return fixedPools.output.map(({ output }) => output);
};

const apy = async () =>
  Promise.all(
    Object.entries(config).map(async ([chain, { auditor }]) => {
      const timestampNow = Math.floor(Date.now() / 1_000);
      const timestamp24hsAgo = timestampNow - 86_400;
      /** @type {[number, number]} */
      const [startBlock, endBlock] = await getBlocksByTime([timestamp24hsAgo, timestampNow], chain);
      /** @type {string[]} */
      const markets = (
        await api.abi.call({
          target: auditor,
          abi: abis.allMarkets,
          block: startBlock,
          chain,
        })
      ).output;

      const adjustFactors = (
        await api.abi.multiCall({
          abi: abis.marketsData,
          calls: markets.map((market) => ({ target: auditor, params: [market] })),
          chain,
          block: endBlock,
        })
      ).output.map(({ output: { adjustFactor } }) => adjustFactor);

      const [
        { assets, decimals, maxFuturePools },
        {
          totalAssets: prevTotalAssets,
          totalSupply: prevTotalSupply,
          totalFloatingBorrowAssets: prevTotalFloatingBorrowAssets,
          totalFloatingBorrowShares: prevTotalFloatingBorrowShares,
        },
        { totalAssets, totalSupply, totalFloatingBorrowAssets, totalFloatingBorrowShares },
        { previewFloatingAssetsAverages, backupFeeRates, interestRateModels },
      ] = await Promise.all([
        metadata(markets, chain, startBlock),
        totals(markets, chain, startBlock),
        totals(markets, chain, endBlock),
        rates(markets, chain, endBlock),
      ]);

      const symbols = (
        await api.abi.multiCall({
          abi: abis.symbol,
          calls: assets.map((target) => ({ target })),
          chain,
          block: endBlock,
        })
      ).output.map(({ output }) => output);

      const { pricesByAddress } = await getPrices(assets, chain);
      const minMaturity = timestampNow - (timestampNow % INTERVAL) + INTERVAL;

      return markets.reduce(async (pools, market, i) => {
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
        const fixedPoolsData = await fixedPools(market, chain, endBlock, maturities);

        /** @type {Pool[]} */
        const fixed = await Promise.all(
          maturities.map(async (maturity, j) => {
            const { borrowed, supplied, unassignedEarnings } = fixedPoolsData[j];
            const depositRate =
              borrowed - Math.min(borrowed, supplied) > 0
                ? (unassignedEarnings * (1e18 - backupFeeRates[i])) / (borrowed - Math.min(borrowed, supplied))
                : 0;

            const secsToMaturity = maturity - timestampNow;
            const fixedDepositAPR = (31_536_000 * depositRate) / secsToMaturity / 1e16;

            const { rate: minFixedRate } = (
              await api.abi.call({
                target: interestRateModels[i],
                abi: abis.minFixedRate,
                params: [borrowed, supplied, previewFloatingAssetsAverages[i]],
                block: endBlock,
                chain,
              })
            ).output;
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

        return [...(await pools), floating, ...fixed];
      }, []);
    })
  ).then((pools) => pools.flat());

module.exports = {
  apy,
  url,
};

const abis = {
  allMarkets: {
    inputs: [],
    name: "allMarkets",
    outputs: [{ internalType: "contract Market[]", name: "", type: "address[]" }],
    stateMutability: "view",
    type: "function",
  },
  asset: {
    inputs: [],
    name: "asset",
    outputs: [{ internalType: "contract ERC20", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  decimals: {
    inputs: [],
    name: "decimals",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  symbol: {
    inputs: [],
    name: "symbol",
    outputs: [{ internalType: "string", name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  totalAssets: {
    inputs: [],
    name: "totalAssets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  totalFloatingBorrowAssets: {
    inputs: [],
    name: "totalFloatingBorrowAssets",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  totalFloatingBorrowShares: {
    inputs: [],
    name: "totalFloatingBorrowShares",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  totalSupply: {
    inputs: [],
    name: "totalSupply",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  maxFuturePools: {
    inputs: [],
    name: "maxFuturePools",
    outputs: [{ internalType: "uint8", name: "", type: "uint8" }],
    stateMutability: "view",
    type: "function",
  },
  fixedPools: {
    inputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    name: "fixedPools",
    outputs: [
      { internalType: "uint256", name: "borrowed", type: "uint256" },
      { internalType: "uint256", name: "supplied", type: "uint256" },
      { internalType: "uint256", name: "unassignedEarnings", type: "uint256" },
      { internalType: "uint256", name: "lastAccrual", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  previewFloatingAssetsAverage: {
    inputs: [],
    name: "previewFloatingAssetsAverage",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  backupFeeRate: {
    inputs: [],
    name: "backupFeeRate",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  interestRateModel: {
    inputs: [],
    name: "interestRateModel",
    outputs: [{ internalType: "contract InterestRateModel", name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  minFixedRate: {
    inputs: [
      { internalType: "uint256", name: "borrowed", type: "uint256" },
      { internalType: "uint256", name: "supplied", type: "uint256" },
      { internalType: "uint256", name: "backupAssets", type: "uint256" },
    ],
    name: "minFixedRate",
    outputs: [
      { internalType: "uint256", name: "rate", type: "uint256" },
      { internalType: "uint256", name: "utilization", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  marketsData: {
    inputs: [
      {
        internalType: "contract Market",
        name: "",
        type: "address",
      },
    ],
    name: "markets",
    outputs: [
      {
        internalType: "uint128",
        name: "adjustFactor",
        type: "uint128",
      },
      {
        internalType: "uint8",
        name: "decimals",
        type: "uint8",
      },
      {
        internalType: "uint8",
        name: "index",
        type: "uint8",
      },
      {
        internalType: "bool",
        name: "isListed",
        type: "bool",
      },
      {
        internalType: "contract IPriceFeed",
        name: "priceFeed",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
};

/** @typedef {{ pool: string, chain: string, project: string, symbol: string, tvlUsd: number, apyBase?: number, apyReward?: number, rewardTokens?: Array<string>, underlyingTokens?: Array<string>, poolMeta?: string, url?: string, apyBaseBorrow?: number, apyRewardBorrow?: number, totalSupplyUsd?: number, totalBorrowUsd?: number, ltv?: number }} Pool */
/** @typedef {{ borrowed: number, supplied: number, unassignedEarnings: number }} FixedPool */
