const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');
const { getMerklRewardsForChain } = require('../merkl/merkl-by-identifier');

const PROJECT = 'ichi-vaults';

// Subgraph config per chain — maps vault addresses to their subgraph
// v2 subgraphs have pre-calculated feeApr_7d; v1 requires manual calculation
const SUBGRAPHS = {
  hyperliquid: [
    {
      url: 'https://api.goldsky.com/api/public/project_clynrq1h8gam301xx6vgngo9p/subgraphs/g2/hyperevm-v2-projectx/gn',
      version: 'v2',
      vaults: [
        '0x60fA80A539A66F52d58aE837f970B60bcbBe005a',
        '0x0CA65598Aab027900650A28d0c440810cbe8C0E0',
      ],
    },
  ],
  citrea: [
    {
      url: 'https://api.goldsky.com/api/public/project_clynrq1h8gam301xx6vgngo9p/subgraphs/g2/citrea-v2-satsuma/gn',
      version: 'v2',
      vaults: [
        '0xe6cA7dEd0a0D5B07B40999E90f84f85B242441Dd',
        '0xb665ffd7422b89B7138cD58bDa244de97c27067e',
        '0xFb7ea62B5721eeCAF80D53bD05C9E61BD57A3352',
      ],
    },
  ],
  celo: [
    {
      url: 'https://api.studio.thegraph.com/query/88584/celo-v1/version/latest',
      version: 'v1',
      vaults: [
        '0x606a91b2F0937973E9f2136Bb569274Ce7A56b85',
        '0xB98A8247C410a81b34D1e3F93709053BC078190f',
        '0x46689E56aF9b3c9f7D88F2A987264D07C0815e14',
        '0xf346b825241E30B8c1710CDc3B1E262f7EE70D4d',
        '0x0a56FA7dC1EF052d6C08EcBfB2E877A1fE13133A',
        '0xEc3a46BdDf6d9293A942de851A6B75830e844c6f',
      ],
    },
  ],
};

// Fetch fee APR from v2 subgraphs (pre-calculated by indexer)
const fetchFeeAprV2 = async (subgraphUrl, vaultAddresses) => {
  const query = gql`
    query ($ids: [String!]!) {
      ichiVaults(where: { id_in: $ids }) {
        id
        feeApr_7d
      }
    }
  `;
  try {
    const data = await request(subgraphUrl, query, {
      ids: vaultAddresses.map((a) => a.toLowerCase()),
    });
    const map = {};
    (data.ichiVaults || []).forEach((v) => {
      map[v.id.toLowerCase()] = Number(v.feeApr_7d) * 100; // convert to percentage
    });
    return map;
  } catch {
    return {};
  }
};

// Fetch fee APR from v1 subgraphs (manual calculation from fee events)
const fetchFeeAprV1 = async (subgraphUrl, vaultAddresses) => {
  const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 86400;
  const map = {};

  for (const addr of vaultAddresses) {
    try {
      const query = gql`
        query ($vault: String!, $ts: BigInt!) {
          vaultCollectFees(
            where: { vault: $vault, createdAtTimestamp_gt: $ts }
            orderBy: createdAtTimestamp
            orderDirection: desc
            first: 100
          ) {
            feeAmount0
            feeAmount1
            totalAmount0
            totalAmount1
            sqrtPrice
            createdAtTimestamp
          }
          vaultRebalances(
            where: { vault: $vault, createdAtTimestamp_gt: $ts }
            orderBy: createdAtTimestamp
            orderDirection: desc
            first: 100
          ) {
            feeAmount0
            feeAmount1
            totalAmount0
            totalAmount1
            sqrtPrice
            createdAtTimestamp
          }
        }
      `;
      const data = await request(subgraphUrl, query, {
        vault: addr.toLowerCase(),
        ts: sevenDaysAgo.toString(),
      });

      const events = [
        ...(data.vaultCollectFees || []),
        ...(data.vaultRebalances || []),
      ];
      if (events.length === 0) continue;

      // Sum fees — convert to token0 terms using sqrtPrice
      // sqrtPrice is in Q96 format: price = (sqrtPrice / 2^96)^2
      let totalFees = 0;
      let latestTvl = 0;

      for (const e of events) {
        const sqrtPrice = Number(e.sqrtPrice) / 2 ** 96;
        const price = sqrtPrice * sqrtPrice; // token1 per token0
        const fee0 = Number(e.feeAmount0);
        const fee1 = Number(e.feeAmount1);
        totalFees += fee0 + (price > 0 ? fee1 / price : 0);

        // Use the latest event for current TVL
        if (!latestTvl) {
          const tvl0 = Number(e.totalAmount0);
          const tvl1 = Number(e.totalAmount1);
          latestTvl = tvl0 + (price > 0 ? tvl1 / price : 0);
        }
      }

      if (latestTvl > 0) {
        const feeApr = (totalFees / 7) * 365 / latestTvl;
        map[addr.toLowerCase()] = feeApr * 100; // percentage
      }
    } catch {}
  }

  return map;
};

const getPoolsForChain = async (chain, subgraphConfigs) => {
  const allVaults = subgraphConfigs.flatMap((c) => c.vaults);

  const [token0s, token1s, amounts] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: allVaults.map((v) => ({ target: v })),
      chain,
      abi: 'address:token0',
    }),
    sdk.api.abi.multiCall({
      calls: allVaults.map((v) => ({ target: v })),
      chain,
      abi: 'address:token1',
    }),
    sdk.api.abi.multiCall({
      calls: allVaults.map((v) => ({ target: v })),
      chain,
      abi: 'function getTotalAmounts() view returns (uint256, uint256)',
    }),
  ]);

  // Collect unique tokens
  const tokenSet = new Set();
  const tokenAddrs = [];
  for (let i = 0; i < allVaults.length; i++) {
    const t0 = token0s.output[i].output;
    const t1 = token1s.output[i].output;
    if (t0) tokenSet.add(t0);
    if (t1) tokenSet.add(t1);
    tokenAddrs.push({ t0, t1 });
  }
  const uniqueTokens = [...tokenSet];

  const [decResults, symResults] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: uniqueTokens.map((t) => ({ target: t })),
      chain,
      abi: 'erc20:decimals',
    }),
    sdk.api.abi.multiCall({
      calls: uniqueTokens.map((t) => ({ target: t })),
      chain,
      abi: 'erc20:symbol',
    }),
  ]);

  const decMap = {};
  const symMap = {};
  uniqueTokens.forEach((t, i) => {
    decMap[t.toLowerCase()] = Number(decResults.output[i].output || 18);
    symMap[t.toLowerCase()] = symResults.output[i].output || 'UNKNOWN';
  });

  const coins = uniqueTokens.map((t) => `${chain}:${t}`);
  const prices = (await utils.getPrices(coins)).pricesByAddress;

  // Fetch fee APRs from all subgraphs
  const feeAprMap = {};
  await Promise.all(
    subgraphConfigs.map(async (config) => {
      const aprs =
        config.version === 'v2'
          ? await fetchFeeAprV2(config.url, config.vaults)
          : await fetchFeeAprV1(config.url, config.vaults);
      Object.assign(feeAprMap, aprs);
    })
  );

  const pools = [];
  for (let i = 0; i < allVaults.length; i++) {
    const { t0, t1 } = tokenAddrs[i];
    if (!t0 || !t1) continue;

    const [amount0, amount1] = amounts.output[i].output;
    const dec0 = decMap[t0.toLowerCase()];
    const dec1 = decMap[t1.toLowerCase()];
    const sym0 = symMap[t0.toLowerCase()];
    const sym1 = symMap[t1.toLowerCase()];
    const price0 = prices[t0.toLowerCase()];
    const price1 = prices[t1.toLowerCase()];

    const tvl0 = price0 ? (Number(amount0) / 10 ** dec0) * price0 : 0;
    const tvl1 = price1 ? (Number(amount1) / 10 ** dec1) * price1 : 0;
    const tvlUsd = tvl0 + tvl1;
    if (tvlUsd === 0) continue;

    const apyBase = feeAprMap[allVaults[i].toLowerCase()] || null;

    pools.push({
      pool: `${allVaults[i]}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: PROJECT,
      symbol: `${sym0}-${sym1}`,
      tvlUsd,
      apyBase,
      underlyingTokens: [t0, t1],
      url: 'https://app.ichi.org/vault',
    });
  }

  // Fetch merkl rewards by identifier
  const vaultAddrs = pools.map((p) => p.pool.split('-')[0]);
  const rewards = await getMerklRewardsForChain(vaultAddrs, chain);

  return pools.map((p) => {
    const addr = p.pool.split('-')[0];
    const reward = rewards[addr.toLowerCase()];
    if (reward && reward.apyReward > 0) {
      return {
        ...p,
        apyReward: reward.apyReward,
        rewardTokens: reward.rewardTokens,
      };
    }
    return p;
  });
};

const apy = async () => {
  const results = await Promise.all(
    Object.entries(SUBGRAPHS).map(([chain, configs]) =>
      getPoolsForChain(chain, configs).catch((e) => {
        console.log(`ichi-vaults error on ${chain}: ${e.message}`);
        return [];
      })
    )
  );
  return results.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.ichi.org/',
};
