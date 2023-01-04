const { util, api } = require("@defillama/sdk");
const { aprToApy, getBlocksByTime, getPrices } = require("../utils");

const config = {
  ethereum: {
    auditor: "0x310A2694521f75C7B2b64b5937C16CE65C3EFE01",
  },
};

const url = "https://app.exact.ly";

const metadata = async (markets, chain, block) => {
  const [asset, decimals, symbol] = await Promise.all(
    ["asset", "decimals", "symbol"].map((key) =>
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
    symbols: symbol.output.map(({ output }) => output),
  };
};

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

const apy = async () =>
  Promise.all(
    Object.entries(config).map(async ([chain, { auditor }]) => {
      const timestampNow = Math.floor(Date.now() / 1_000);
      const timestamp24hsAgo = timestampNow - 86_400;
      const [startBlock, endBlock] = await getBlocksByTime([timestamp24hsAgo, timestampNow], chain);
      const markets = (
        await api.abi.call({
          target: auditor,
          abi: abis.allMarkets,
          block: startBlock,
          chain,
        })
      ).output;
      const [
        { assets, symbols, decimals },
        {
          totalAssets: prevTotalAssets,
          totalSupply: prevTotalSupply,
          totalFloatingBorrowAssets: prevTotalFloatingBorrowAssets,
          totalFloatingBorrowShares: prevTotalFloatingBorrowShares,
        },
        { totalAssets, totalSupply, totalFloatingBorrowAssets, totalFloatingBorrowShares },
      ] = await Promise.all([
        metadata(markets, chain, startBlock),
        totals(markets, chain, startBlock),
        totals(markets, chain, endBlock),
      ]);
      const { pricesByAddress } = await getPrices(assets, chain);

      return markets.map((market, i) => {
        const shareValue = (totalAssets[i] * 1e18) / totalSupply[i];
        const prevShareValue = (prevTotalAssets[i] * 1e18) / prevTotalSupply[i];
        const proportion = (shareValue * 1e18) / prevShareValue;
        const apr = (proportion / 1e18 - 1) * 365;

        const borrowShareValue = (totalFloatingBorrowAssets[i] * 1e18) / totalFloatingBorrowShares[i];
        const prevBorrowShareValue = (prevTotalFloatingBorrowAssets[i] * 1e18) / prevTotalFloatingBorrowShares[i];
        const borrowProportion = (borrowShareValue * 1e18) / prevBorrowShareValue;
        const borrowApr = (borrowProportion / 1e18 - 1) * 365;

        const usdUnitPrice = pricesByAddress[assets[i].toLowerCase()];

        return {
          pool: `${market}-${chain}`.toLowerCase(),
          chain,
          project: "exactly",
          symbol: symbols[i],
          tvlUsd: ((totalAssets[i] - totalFloatingBorrowAssets[i]) * usdUnitPrice) / 10 ** decimals[i],
          apy: aprToApy(apr * 100),
          underlyingTokens: [assets[i]],
          url: `${url}/${symbols[i]}`,
          apyBaseBorrow: aprToApy(borrowApr),
          totalSupplyUsd: (totalSupply[i] * usdUnitPrice) / 10 ** decimals[i],
          totalBorrowUsd: (totalFloatingBorrowAssets[i] * usdUnitPrice) / 10 ** decimals[i],
        };
      });
    })
  ).then((pools) => pools.flat());

module.exports = { apy, url };

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
};
