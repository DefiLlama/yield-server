const { request } = require('graphql-request');

const GRAPH_URL = {
    Hedera: "https://api.goldsky.com/api/public/project_cmdfkhd2uxajf01vq022c7ion/subgraphs/isle-hedera-main/main/gn"
};
const POOL_URL_BASE= "https://app.isle.finance/pools/";
const PROJECT_SLUG = "isle-finance";
const gqlQueries = {
  poolsData: `
    query PoolsData {
      pools: markets(where: { isActive: true }) {
        address: id
        lockedAmount: inputTokenBalance
        borrowedAmount: variableBorrowedTokenBalance
        rates {
          rate
          side
        }
        inputToken {
          address: id
          decimals
          name
          symbol
        }
      }
    }
  `
}

function roundTo2Decimals(num) {
  return Math.round(num * 100) / 100;
}

function formatByDecimals(value, decimals = 0) {
  if (value == null || isNaN(value)) return 0;
  const num = Number(value) / 10 ** decimals;
  return roundTo2Decimals(num);
}

function formatApy(value) {
  if (value == null || isNaN(value)) return 0;
  const num = Number(value);
  return roundTo2Decimals(num);
}

const apy = async () => {
  const allPools = [];

  for (const [chain, url] of Object.entries(GRAPH_URL)) {
    try {
      const { pools } = await request(url, gqlQueries.poolsData);
      if (!pools?.length) continue;

      const chainPools = pools.map((p) => {
        const tokenAddr = p?.inputToken?.address || "";
        const tokenDecimals = p?.inputToken?.decimals ?? 0;
        return {
          pool: `${p?.address || ""}-${chain}`.toLowerCase(),
          chain,
          project: PROJECT_SLUG,
          symbol: p?.inputToken?.symbol || "",
          tvlUsd: formatByDecimals(p?.lockedAmount, tokenDecimals),
          totalBorrowUsd: formatByDecimals(p?.borrowedAmount, tokenDecimals),
          apyBase: formatApy(p?.rates?.find((r) => (r?.side || "") === "LENDER")?.rate),
          apyBaseBorrow: formatApy(p?.rates?.find((r) => (r?.side || "") === "BORROWER")?.rate),
          underlyingTokens: tokenAddr ? [tokenAddr] : [],
          url: `${POOL_URL_BASE}${p?.address ?? ""}/overview`,
        };
      });

      allPools.push(...chainPools);
    } catch (err) {
      console.error(`${chain} error:`, err?.message ?? err);
    }
  }
  return allPools;
};

module.exports = {
  apy,
};