const axios = require('axios');
const sdk = require('@defillama/sdk');
const { utils: ethersUtils } = require('ethers');

const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const lensAbi = require('./lens.abi.json');

// ---------------------------------------------------------------------------
// Subgraph-based architecture (replaces event log scanning + lens multicalls)
// - Eliminates scanning millions of blocks per chain on every run
// - Eliminates oversized getVaultInfoFull multicalls that caused bob/sonic failures
// - Server-side filtering: only fetches vaults with active supply APY
// - Asset symbol parsed from vault symbol (e{SYMBOL}-{N}), decimals from subgraph
// ---------------------------------------------------------------------------

const SUBGRAPH_BASE =
  'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs';

const chains = {
  ethereum: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-mainnet/latest/gn`,
    urlChain: 'ethereum',
    vaultLens: '0x83801C7BbeEFa54B91F8A07E36D81515a0Fc5b60',
    eulerEarnGovernedPerspective: '0x492e9FE1289d43F8bB6275237BF16c9248C74D44',
  },
  bob: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-bob/latest/gn`,
    urlChain: 'bob',
    vaultLens: '0xC6B56a52e5823659d90F3020164b92D1c2de03CE',
    eulerEarnGovernedPerspective: '0x7b4065698dF1dd0DF7ad4876A5050657295f836a',
  },
  sonic: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-sonic/latest/gn`,
    urlChain: 'sonic',
    vaultLens: '0x4c7BA548032FE3eA11b7D6BeaF736B3B74F69248',
    eulerEarnGovernedPerspective: '0x044Dc2d44BC443c00f615Cc453501F881E01E021',
  },
  avax: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-avalanche/latest/gn`,
    urlChain: 'avalanche',
    vaultLens: '0xcC5F7593a4D5974F84A30B28Bd3fdb374319a254',
    eulerEarnGovernedPerspective: '0x23559eF969252b81d8DA2b86a76D85fb602860Ad',
  },
  berachain: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-berachain/latest/gn`,
    urlChain: 'berachain',
    vaultLens: '0x2ffd260BAd257C08516B649c93Ea3eb6b63a5639',
    eulerEarnGovernedPerspective: '0xff216ceb263b3be308De306dbC67E2D82Ed70ea9',
  },
  bsc: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-bsc/latest/gn`,
    urlChain: 'bnbsmartchain',
    vaultLens: '0x84641751808f85F54344369036594E1a7301a414',
    eulerEarnGovernedPerspective: '0xEF7599ef1CB0ec48ED6f4174641462D6919A7CE2',
  },
  base: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-base/latest/gn`,
    urlChain: 'base',
    vaultLens: '0x3530dA02ceC2818477888FdC77e777b566B6db4C',
    eulerEarnGovernedPerspective: '0x08B817C17d84DF89AA371084D910081a5Cc04724',
  },
  swellchain: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-swell/latest/gn`,
    urlChain: 'swellchain',
    vaultLens: '0x94Dd6A076838D6Fc5031e32138b95d810793DB1c',
    eulerEarnGovernedPerspective: '0xD5491C7Da8274016244aF8a0bD3998BCc43e4b24',
  },
  unichain: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-unichain/latest/gn`,
    urlChain: 'unichain',
    vaultLens: '0xd40DD19eD88a949436f784877A1BB59660ee8DE3',
    eulerEarnGovernedPerspective: '0x16F187C4EFCCbbF5B530A9c64447B89c4D73F3F2',
  },
  arbitrum: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-arbitrum/latest/gn`,
    urlChain: 'arbitrumone',
    vaultLens: '0x59d28aF1fC4A52EE402C9099BeCEf333366184Df',
    eulerEarnGovernedPerspective: '0xeE3de4507cFAc8756634dC5272B4A6BB7f00C49E',
  },
  linea: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-linea/latest/gn`,
    urlChain: 'lineamainnet',
    vaultLens: '0xd20E9D6cfa0431aC306cC9906896a7BC0BE0Db64',
    eulerEarnGovernedPerspective: '0xb42a9DD67bD6b48940A862C0f0c8a6C5DD26582f',
  },
  // TAC subgraph lacks the vault state entity (no supplyApy/borrowApy) -- excluded until updated
  monad: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-monad/latest/gn`,
    urlChain: 'monad',
    vaultLens: '0x15d1Cc54fB3f7C0498fc991a23d8Dc00DF3c32A0',
    eulerEarnGovernedPerspective: '0xe4A695d715732db3d694E30EC57b1acc8cC4368b',
  },
  plasma: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-plasma/latest/gn`,
    urlChain: 'plasma',
    vaultLens: '0x62FF27a1fBE6024D2933A88D39E0FF877dB4FE0B',
    eulerEarnGovernedPerspective: '0xAA8b9729a047568CB0614165509229A86e345Be1',
  },
  hyperliquid: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-hyperevm/latest/gn`,
    urlChain: 'hyperliquid',
    eulerEarnGovernedPerspective: '0x7b27dED9344D9c66FeAF58D151b52d1359aeA807',
  },
};

// Subgraph APY values are 27-decimal fixed-point; dividing by 1e25 gives percentage
const APY_DIVISOR = 1e25;

// EVK vault symbol format is "e{ASSET_SYMBOL}-{N}" (e.g. "eUSDC-80", "ewstETH-2")
const parseAssetSymbol = (vaultSymbol) =>
  vaultSymbol.replace(/^e/, '').replace(/-\d+$/, '');

// Euler v2 caps use AmountCap encoding (uint16). A value of 0 means "no cap" (unlimited).
// Values 1-63 decode to at most 64 smallest units (effectively dust/zero).
// Governance sets caps to these tiny values to freeze a vault for wind-down.
const CAP_FROZEN_THRESHOLD = 64;
const isCapFrozen = (cap) => cap > 0 && cap < CAP_FROZEN_THRESHOLD;

const EVK_QUERY = `{
  eulerVaults(first: 1000) {
    id
    name
    symbol
    asset
    decimals
    supplyCap
    borrowCap
    state {
      cash
      totalBorrows
      supplyApy
      borrowApy
    }
  }
}`;

const EARN_QUERY = `{
  eulerEarnVaults(first: 1000, where: { totalAssets_gt: "0" }) {
    id
    name
    asset
    totalAssets
    performanceFee
    strategies {
      strategy
      allocatedAssets
    }
  }
}`;

const querySubgraph = async (url, query) => {
  const { data } = await axios.post(url, { query }, { timeout: 30_000 });
  if (data.errors) throw new Error(data.errors[0].message);
  return data.data;
};

const verifiedEarnVaultsAbi = {
  inputs: [],
  name: 'verifiedArray',
  outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
  stateMutability: 'view',
  type: 'function',
};

const getVerifiedEarnVaults = async (chain, config) => {
  if (!config.eulerEarnGovernedPerspective) return new Set();

  try {
    const { output } = await sdk.api.abi.call({
      chain,
      target: config.eulerEarnGovernedPerspective,
      abi: verifiedEarnVaultsAbi,
    });

    return new Set((output || []).map((a) => a.toLowerCase()));
  } catch (err) {
    console.error(
      `Error fetching verified Euler Earn vaults for ${chain}:`,
      err.message || err
    );
    return new Set();
  }
};

const getApys = async () => {
  const chainResults = await Promise.all(
    Object.entries(chains).map(async ([chain, config]) => {
      try {
        // Fetch EVK and Earn vaults from subgraph in parallel
        const [evkData, earnData, verifiedEarnVaults] = await Promise.all([
          querySubgraph(config.subgraph, EVK_QUERY),
          querySubgraph(config.subgraph, EARN_QUERY).catch(() => ({
            eulerEarnVaults: [],
          })),
          getVerifiedEarnVaults(chain, config),
        ]);

        const evkVaults = evkData.eulerVaults || [];
        const earnVaults = (earnData.eulerEarnVaults || []).filter((v) =>
          verifiedEarnVaults.has(v.id.toLowerCase())
        );

        // Build maps from ALL EVK vaults (active or not) for Earn vault lookups
        // Exclude vaults where governance has frozen caps (wind-down mode)
        const evkApyMap = {};
        const assetInfoMap = {};
        for (const v of evkVaults) {
          const frozen =
            isCapFrozen(Number(v.supplyCap)) ||
            isCapFrozen(Number(v.borrowCap));
          if (v.state && Number(v.state.supplyApy) > 0 && !frozen) {
            evkApyMap[v.id] = Number(v.state.supplyApy) / APY_DIVISOR;
          }
          if (!assetInfoMap[v.asset]) {
            assetInfoMap[v.asset] = {
              symbol: parseAssetSymbol(v.symbol),
              decimals: Number(v.decimals),
            };
          }
        }

        // Filter to active vaults for pool output (exclude frozen caps)
        const activeEvkVaults = evkVaults.filter(
          (v) =>
            v.state &&
            Number(v.state.supplyApy) > 0 &&
            !isCapFrozen(Number(v.supplyCap)) &&
            !isCapFrozen(Number(v.borrowCap))
        );

        // Fetch real LTV from lens contract so vaults appear in lendBorrow API
        const ltvMap = {};
        if (config.vaultLens && activeEvkVaults.length > 0) {
          try {
            const ltvAbi = lensAbi.find(
              (m) => m.name === 'getRecognizedCollateralsLTVInfo'
            );
            const ltvResults = await sdk.api.abi
              .multiCall({
                calls: activeEvkVaults.map((v) => ({
                  target: config.vaultLens,
                  params: [v.id],
                })),
                abi: ltvAbi,
                chain,
                permitFailure: true,
              })
              .then((r) => r.output.map((o) => o.output));

            for (let i = 0; i < activeEvkVaults.length; i++) {
              const ltvInfo = ltvResults[i];
              if (!ltvInfo || ltvInfo.length === 0) continue;
              // Take max borrowLTV across all recognized collaterals
              // EVK stores LTV in basis points (10000 = 100%), convert to [0, 1]
              const maxBorrowLTV = Math.max(
                ...ltvInfo.map((l) => Number(l.borrowLTV))
              );
              if (maxBorrowLTV > 0) {
                ltvMap[activeEvkVaults[i].id] = maxBorrowLTV / 10000;
              }
            }
          } catch (err) {
            console.error(
              `Error fetching LTV for ${chain}:`,
              err.message || err
            );
          }
        }

        // Collect unique asset addresses and fetch prices
        const assets = new Set([
          ...activeEvkVaults.map((v) => v.asset),
          ...earnVaults.map((v) => v.asset),
        ]);
        const priceKeys = [...assets].map((a) => `${chain}:${a}`).join(',');
        if (!priceKeys) return [];

        const { data: prices } = await axios.get(
          `https://coins.llama.fi/prices/current/${priceKeys}`
        );

        // --- Build EVK pools ---
        const evkPools = activeEvkVaults
          .map((v) => {
            const price = prices.coins[`${chain}:${v.asset}`]?.price;
            if (price === undefined || price === null) return null;

            const assetSymbol = parseAssetSymbol(v.symbol);
            const assetDecimals = Number(v.decimals);
            const cash = Number(v.state.cash) / 10 ** assetDecimals;
            const borrows = Number(v.state.totalBorrows) / 10 ** assetDecimals;
            const totalSupplyUsd = (cash + borrows) * price;
            const totalBorrowUsd = borrows * price;

            const vaultAddr = ethersUtils.getAddress(v.id);
            const assetAddr = ethersUtils.getAddress(v.asset);
            const ltv = ltvMap[v.id];
            return {
              pool: vaultAddr,
              chain,
              project: 'euler-v2',
              symbol: assetSymbol,
              poolMeta: v.name,
              tvlUsd: totalSupplyUsd - totalBorrowUsd,
              totalSupplyUsd,
              totalBorrowUsd,
              apyBase: Number(v.state.supplyApy) / APY_DIVISOR,
              apyBaseBorrow: Number(v.state.borrowApy) / APY_DIVISOR,
              underlyingTokens: [assetAddr],
              ltv: ltv !== undefined ? ltv : undefined,
              url: chain === 'hyperliquid'
                ? `https://hypurrfi.com/markets/elend/999/${vaultAddr}`
                : `https://app.euler.finance/lend/${vaultAddr}?network=${config.urlChain}`,
            };
          })
          .filter(Boolean);

        // --- Build Euler Earn pools ---
        const earnPools = earnVaults
          .map((v) => {
            const priceData = prices.coins[`${chain}:${v.asset}`];
            if (!priceData?.price) return null;

            const assetInfo = assetInfoMap[v.asset];
            const symbol = assetInfo?.symbol || priceData.symbol;
            const decimals = assetInfo?.decimals ?? priceData.decimals;
            const tvlUsd =
              (Number(v.totalAssets) / 10 ** decimals) * priceData.price;

            // Calculate APY from weighted average of underlying EVK strategy APYs
            let apyBase = null;
            const totalAllocated = v.strategies.reduce(
              (sum, s) => sum + Number(s.allocatedAssets || 0),
              0
            );

            if (totalAllocated > 0 && v.strategies.length > 0) {
              let weightedApy = 0;
              for (const s of v.strategies) {
                const allocated = Number(s.allocatedAssets || 0);
                if (allocated === 0) continue;
                const strategyApy =
                  evkApyMap[s.strategy.toLowerCase()] || 0;
                weightedApy += strategyApy * (allocated / totalAllocated);
              }
              // Apply performance fee
              const feePct = Number(v.performanceFee || 0) / 1e18;
              apyBase = weightedApy * (1 - feePct);
            }

            const earnAddr = ethersUtils.getAddress(v.id);
            const earnAssetAddr = ethersUtils.getAddress(v.asset);
            return {
              pool: `euler-earn-${earnAddr}-${chain}`,
              chain,
              project: 'euler-v2',
              symbol,
              poolMeta: v.name,
              tvlUsd,
              apyBase,
              underlyingTokens: [earnAssetAddr],
              url: chain === 'hyperliquid'
                ? `https://hypurrfi.com/markets/elend/999/${earnAddr}`
                : `https://app.euler.finance/earn/${earnAddr}?network=${config.urlChain}`,
            };
          })
          .filter((p) => p && p.tvlUsd > 100);

        return [...evkPools, ...earnPools];
      } catch (err) {
        console.error(`Error processing chain ${chain}:`, err.message || err);
        return [];
      }
    })
  );

  return await addMerklRewardApy(chainResults.flat(), 'euler', (p) => {
    const match = p.pool.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : p.pool;
  });
};

module.exports = {
  timetravel: false,
  apy: getApys,
};
