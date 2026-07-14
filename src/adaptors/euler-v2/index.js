const axios = require('axios');
const sdk = require('@defillama/sdk');
const { utils: ethersUtils } = require('ethers');

const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const lensAbi = require('./lens.abi.json');
const eulerEarnLensAbi = require('./eulerEarnLens.abi.json');
const { getPriceApiData } = require('../utils');

// Euler v2 EVK vaults are both lend/debt markets and possible collateral assets
// for other EVK markets. Vault rows keep the real supply/borrow state; separate
// `routing_collateral` rows model the allowed collateral -> debt links for
// downstream borrow routers using `routeGroupKey` and `underlyingStateKey`.
// ---------------------------------------------------------------------------
// Hybrid architecture:
// - EVK lend vaults are discovered from the subgraph, then priced from live lens data
// - Euler Earn vault inclusion and vault state come from live lens/governance calls
// - Eliminates scanning millions of blocks per chain on every run
// ---------------------------------------------------------------------------

const SUBGRAPH_BASE =
  'https://api.goldsky.com/api/public/project_cm4iagnemt1wp01xn4gh1agft/subgraphs';

const chains = {
  ethereum: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-mainnet/latest/gn`,
    urlChain: 'ethereum',
    networkId: 1,
    vaultLens: '0x83801C7BbeEFa54B91F8A07E36D81515a0Fc5b60',
    eulerEarnVaultLens: '0x20954C32Bc063a125036b2563ca74fa98b5013D9',
    eulerEarnGovernedPerspective: '0x492e9FE1289d43F8bB6275237BF16c9248C74D44',
  },
  avax: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-avalanche/latest/gn`,
    urlChain: 'avalanche',
    networkId: 43114,
    vaultLens: '0xcC5F7593a4D5974F84A30B28Bd3fdb374319a254',
    eulerEarnVaultLens: '0xe58989e0E3f20f2e56fD407C6E28fe63675fDdB8',
    eulerEarnGovernedPerspective: '0x23559eF969252b81d8DA2b86a76D85fb602860Ad',
  },
  bsc: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-bsc/latest/gn`,
    urlChain: 'bnbsmartchain',
    networkId: 56,
    vaultLens: '0x84641751808f85F54344369036594E1a7301a414',
    eulerEarnVaultLens: '0x079E485A869d2cEca0dCbB96A8308e6d972aB57f',
    eulerEarnGovernedPerspective: '0xEF7599ef1CB0ec48ED6f4174641462D6919A7CE2',
  },
  base: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-base/latest/gn`,
    urlChain: 'base',
    networkId: 8453,
    vaultLens: '0x3530dA02ceC2818477888FdC77e777b566B6db4C',
    eulerEarnVaultLens: '0x0BBf9eE761bFF1c4d64dB608781D5e3beFeed875',
    eulerEarnGovernedPerspective: '0x08B817C17d84DF89AA371084D910081a5Cc04724',
  },
  unichain: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-unichain/latest/gn`,
    urlChain: 'unichain',
    networkId: 130,
    vaultLens: '0xd40DD19eD88a949436f784877A1BB59660ee8DE3',
    eulerEarnVaultLens: '0x3a373AF9759ac6546A6BFa6eAAbb0B8fc1E1d241',
    eulerEarnGovernedPerspective: '0x16F187C4EFCCbbF5B530A9c64447B89c4D73F3F2',
  },
  arbitrum: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-arbitrum/latest/gn`,
    urlChain: 'arbitrumone',
    networkId: 42161,
    vaultLens: '0x59d28aF1fC4A52EE402C9099BeCEf333366184Df',
    eulerEarnVaultLens: '0x15971F66916d402646ad3DEaE482ccf37b2100ef',
    eulerEarnGovernedPerspective: '0xeE3de4507cFAc8756634dC5272B4A6BB7f00C49E',
  },
  linea: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-linea/latest/gn`,
    urlChain: 'lineamainnet',
    networkId: 59144,
    vaultLens: '0xd20E9D6cfa0431aC306cC9906896a7BC0BE0Db64',
    eulerEarnVaultLens: '0xF8074bbcC6e9c04EB6d3Fc69A5D502Ca774f663C',
    eulerEarnGovernedPerspective: '0xb42a9DD67bD6b48940A862C0f0c8a6C5DD26582f',
  },
  monad: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-monad/latest/gn`,
    urlChain: 'monad',
    networkId: 143,
    vaultLens: '0x15d1Cc54fB3f7C0498fc991a23d8Dc00DF3c32A0',
    eulerEarnVaultLens: '0x78f40a9822d170D7bC275986Dc2a4eF02C972367',
    eulerEarnGovernedPerspective: '0xe4A695d715732db3d694E30EC57b1acc8cC4368b',
  },
  plasma: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-plasma/latest/gn`,
    urlChain: 'plasma',
    networkId: 9745,
    vaultLens: '0x62FF27a1fBE6024D2933A88D39E0FF877dB4FE0B',
    eulerEarnVaultLens: '0x984F25135BEc8fCabA26A6005c1632BC0DCcFd7C',
    eulerEarnGovernedPerspective: '0xAA8b9729a047568CB0614165509229A86e345Be1',
  },
  hyperliquid: {
    subgraph: `${SUBGRAPH_BASE}/euler-simple-hyperevm/latest/gn`,
    urlChain: 'hyperliquid',
    networkId: 999,
    vaultLens: '0x34B90aeCBe2d0b1Bb337799CF0AA9939E1F39c1B',
    eulerEarnVaultLens: '0x2b76970adEAB958956975895a9F1888Ea6E4Ac4A',
    eulerEarnGovernedPerspective: '0x7b27dED9344D9c66FeAF58D151b52d1359aeA807',
  },
};

// Subgraph APY values are 27-decimal fixed-point; dividing by 1e25 gives percentage
const APY_DIVISOR = 1e25;

// EVK vault symbol format is "e{ASSET_SYMBOL}-{N}" (e.g. "eUSDC-80", "ewstETH-2")
const parseAssetSymbol = (vaultSymbol) =>
  vaultSymbol.replace(/^e/, '').replace(/-\d+$/, '');

const toNumber = (value) => Number(value?.toString?.() ?? value);

// Euler lens returns resolved cap amounts. Tiny non-zero caps mean dust/frozen.
// Governance sets caps to these tiny values to freeze a vault for wind-down.
const CAP_FROZEN_THRESHOLD = 64;
const isCapFrozen = (cap) => cap > 0 && cap < CAP_FROZEN_THRESHOLD;
const toBigInt = (value) =>
  value === undefined || value === null ? 0n : BigInt(value.toString());

const getAvailableBorrowUsd = (info, price, decimals) => {
  const cash = toBigInt(info.totalCash);
  const borrowed = toBigInt(info.totalBorrowed);
  const borrowCap = toBigInt(info.borrowCap);
  const capHeadroom = borrowCap > borrowed ? borrowCap - borrowed : 0n;
  const availableRaw = cash < capHeadroom ? cash : capHeadroom;

  return (Number(availableRaw.toString()) / 10 ** decimals) * price;
};

const getBorrowLtv = (ltvInfo) => toNumber(ltvInfo.borrowLTV ?? ltvInfo[1]);
const getCollateralVault = (ltvInfo) => ltvInfo.collateral ?? ltvInfo[0];

const EVK_QUERY = `{
  vaults(first: 1000) {
    id
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

const eulerEarnVaultInfoFullAbi = eulerEarnLensAbi.find(
  (m) => m.name === 'getVaultInfoFull'
);
const vaultInfoFullAbi = lensAbi.find((m) => m.name === 'getVaultInfoFull');
const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size)
  );

const getSupplyApyFromVaultInfo = (info) => {
  const rateInfo = info?.irmInfo?.interestRateInfo?.[0];
  const supplyApy = rateInfo?.supplyAPY ?? rateInfo?.[4];
  return supplyApy === undefined || supplyApy === null
    ? null
    : toNumber(supplyApy) / APY_DIVISOR;
};

const getBorrowApyFromVaultInfo = (info) => {
  const rateInfo = info?.irmInfo?.interestRateInfo?.[0];
  const borrowApy = rateInfo?.borrowAPY ?? rateInfo?.[3];
  return borrowApy === undefined || borrowApy === null
    ? null
    : toNumber(borrowApy) / APY_DIVISOR;
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

const getEulerEarnVaults = async (chain, config, verifiedEarnVaults) => {
  if (!config.eulerEarnVaultLens || verifiedEarnVaults.size === 0) return [];

  try {
    const { output } = await sdk.api.abi.multiCall({
      calls: [...verifiedEarnVaults].map((vault) => ({
        target: config.eulerEarnVaultLens,
        params: [vault],
      })),
      abi: eulerEarnVaultInfoFullAbi,
      chain,
      permitFailure: true,
    });

    return output.map((o) => o.output).filter(Boolean);
  } catch (err) {
    console.error(
      `Error fetching Euler Earn vault info for ${chain}:`,
      err.message || err
    );
    return [];
  }
};

const getEvkVaultInfoMap = async (chain, config, evkVaults) => {
  if (!config.vaultLens || evkVaults.length === 0) return {};

  const map = {};
  for (const vaultChunk of chunk(evkVaults, 25)) {
    try {
      const { output } = await sdk.api.abi.multiCall({
        calls: vaultChunk.map((v) => ({
          target: config.vaultLens,
          params: [v.id],
        })),
        abi: vaultInfoFullAbi,
        chain,
        permitFailure: true,
      });

      output.forEach((result, i) => {
        if (result?.output) map[vaultChunk[i].id.toLowerCase()] = result.output;
      });
    } catch (err) {
      console.error(
        `Error fetching EVK vault info batch for ${chain}:`,
        err.message || err
      );
    }
  }

  return map;
};

const getEarnStrategyApyMap = async (chain, config, earnVaults) => {
  if (!config.vaultLens || earnVaults.length === 0) return {};

  const strategies = [
    ...new Set(
      earnVaults.flatMap((v) =>
        (v.strategies || [])
          .filter((s) => toNumber(s.allocatedAssets || 0) > 0)
          .filter((s) => s.info?.isEVault !== false)
          .map((s) => s.strategy.toLowerCase())
      )
    ),
  ];
  if (strategies.length === 0) return {};

  try {
    const { output } = await sdk.api.abi.multiCall({
      calls: strategies.map((strategy) => ({
        target: config.vaultLens,
        params: [strategy],
      })),
      abi: vaultInfoFullAbi,
      chain,
      permitFailure: true,
    });

    return output.reduce((acc, result, i) => {
      const apy = result.output ? getSupplyApyFromVaultInfo(result.output) : null;
      if (apy !== null) acc[strategies[i]] = apy;
      return acc;
    }, {});
  } catch (err) {
    console.error(
      `Error fetching Euler Earn strategy APYs for ${chain}:`,
      err.message || err
    );
    return {};
  }
};

const getApys = async () => {
  const chainResults = await Promise.all(
    Object.entries(chains).map(async ([chain, config]) => {
      try {
        const [evkData, verifiedEarnVaults] = await Promise.all([
          querySubgraph(config.subgraph, EVK_QUERY),
          getVerifiedEarnVaults(chain, config),
        ]);
        const earnVaults = await getEulerEarnVaults(
          chain,
          config,
          verifiedEarnVaults
        );
        const earnStrategyApyMap = await getEarnStrategyApyMap(
          chain,
          config,
          earnVaults
        );

        const evkVaults = evkData.vaults || [];
        const evkVaultInfoMap = await getEvkVaultInfoMap(
          chain,
          config,
          evkVaults
        );

        // Filter to active vaults for pool output (exclude frozen caps)
        const activeEvkVaults = evkVaults.filter(
          (v) => {
            const info = evkVaultInfoMap[v.id.toLowerCase()];
            return (
              info &&
              getSupplyApyFromVaultInfo(info) > 0 &&
              !isCapFrozen(toNumber(info.supplyCap)) &&
              !isCapFrozen(toNumber(info.borrowCap))
            );
          }
        );

        // Collect unique asset addresses and fetch prices
        const assets = new Set(
          activeEvkVaults.map(
            (v) => evkVaultInfoMap[v.id.toLowerCase()].asset
          )
        );
        activeEvkVaults.forEach((v) => {
          const info = evkVaultInfoMap[v.id.toLowerCase()];
          (info.collateralLTVInfo || []).forEach((ltvInfo) => {
            if (getBorrowLtv(ltvInfo) <= 0) return;
            const collateralVault = getCollateralVault(ltvInfo);
            if (!collateralVault) return;
            const collateralInfo =
              evkVaultInfoMap[collateralVault.toLowerCase()];
            if (collateralInfo) assets.add(collateralInfo.asset);
          });
        });
        earnVaults.forEach((v) => assets.add(v.asset));
        const priceKeys = [...assets].map((a) => `${chain}:${a}`).join(',');
        if (!priceKeys) return [];

        const prices = await getPriceApiData(`/prices/current/${priceKeys}`);

        // --- Build EVK pools ---
        const evkPools = activeEvkVaults
          .map((v) => {
            const info = evkVaultInfoMap[v.id.toLowerCase()];
            const price = prices.coins[`${chain}:${info.asset}`]?.price;
            if (price === undefined || price === null) return null;

            const assetSymbol = info.assetSymbol || parseAssetSymbol(info.vaultSymbol);
            const assetDecimals = toNumber(info.assetDecimals);
            const totalSupply =
              toNumber(info.totalAssets) / 10 ** assetDecimals;
            const borrows =
              toNumber(info.totalBorrowed) / 10 ** assetDecimals;
            const totalSupplyUsd = totalSupply * price;
            const totalBorrowUsd = borrows * price;
            const availableBorrowUsd = getAvailableBorrowUsd(
              info,
              price,
              assetDecimals
            );

            const vaultAddr = ethersUtils.getAddress(info.vault || v.id);
            const assetAddr = ethersUtils.getAddress(info.asset);
            return {
              pool: vaultAddr,
              chain,
              project: 'euler-v2',
              routeGroupKey: vaultAddr.toLowerCase(),
              symbol: assetSymbol,
              poolMeta: info.vaultName || info.vaultSymbol,
              tvlUsd: totalSupplyUsd - totalBorrowUsd,
              totalSupplyUsd,
              totalBorrowUsd,
              availableBorrowUsd,
              apyBase: getSupplyApyFromVaultInfo(info),
              apyBaseBorrow: getBorrowApyFromVaultInfo(info),
              underlyingTokens: [assetAddr],
              borrowToken: assetAddr,
              borrowable: availableBorrowUsd > 0,
              ltv: 0,
              url: `https://app.euler.finance/lend/${vaultAddr}?network=${config.urlChain}`,
            };
          })
          .filter(Boolean);
        const evkPoolRouteGroupKeys = new Set(
          evkPools.map((p) => p.routeGroupKey)
        );

        const collateralRoutePools = activeEvkVaults
          .flatMap((v) => {
            const debtInfo = evkVaultInfoMap[v.id.toLowerCase()];
            const debtAssetAddr = ethersUtils.getAddress(debtInfo.asset);
            const debtVaultAddr = ethersUtils.getAddress(debtInfo.vault || v.id);
            const debtRouteGroupKey = debtVaultAddr.toLowerCase();
            if (!evkPoolRouteGroupKeys.has(debtRouteGroupKey)) return [];

            return (debtInfo.collateralLTVInfo || []).map((ltvInfo) => {
              const borrowLtv = getBorrowLtv(ltvInfo);
              if (borrowLtv <= 0) return null;

              const collateralVault = getCollateralVault(ltvInfo);
              if (!collateralVault) return null;
              const collateralInfo =
                evkVaultInfoMap[collateralVault.toLowerCase()];
              if (!collateralInfo) return null;
              if (isCapFrozen(toNumber(collateralInfo.supplyCap))) return null;

              const collateralPrice =
                prices.coins[`${chain}:${collateralInfo.asset}`]?.price;
              if (collateralPrice === undefined || collateralPrice === null) {
                return null;
              }

              const collateralDecimals = toNumber(collateralInfo.assetDecimals);
              const collateralTotalSupplyUsd =
                (toNumber(collateralInfo.totalAssets) /
                  10 ** collateralDecimals) *
                collateralPrice;
              const collateralVaultAddr = ethersUtils.getAddress(
                collateralInfo.vault || collateralVault
              );
              const underlyingStateKey = collateralVaultAddr.toLowerCase();
              const collateralAssetAddr = ethersUtils.getAddress(
                collateralInfo.asset
              );
              const collateralSymbol =
                collateralInfo.assetSymbol ||
                parseAssetSymbol(collateralInfo.vaultSymbol || '');
              const debtSymbol =
                debtInfo.assetSymbol || parseAssetSymbol(debtInfo.vaultSymbol);

              return {
                pool: `${collateralVaultAddr}-${debtVaultAddr}-${chain}`,
                chain,
                project: 'euler-v2',
                poolKind: 'routing_collateral',
                routeGroupKey: debtRouteGroupKey,
                ...(evkPoolRouteGroupKeys.has(underlyingStateKey) && {
                  underlyingStateKey,
                }),
                symbol: collateralSymbol,
                token: null,
                apy: 0,
                poolMeta: `${collateralSymbol}/${debtSymbol}`,
                tvlUsd: collateralTotalSupplyUsd,
                totalSupplyUsd: collateralTotalSupplyUsd,
                underlyingTokens: [collateralAssetAddr],
                borrowToken: debtAssetAddr,
                borrowable: true,
                ltv: borrowLtv / 10000,
                url: `https://app.euler.finance/borrow/${collateralVaultAddr}/${debtVaultAddr}?network=${config.networkId}`,
              };
            });
          })
          .filter(Boolean);

        // --- Build Euler Earn pools ---
        const earnPools = earnVaults
          .map((v) => {
            const priceData = prices.coins[`${chain}:${v.asset}`];
            if (!priceData?.price) return null;

            const symbol = v.assetSymbol || priceData.symbol;
            const decimals = toNumber(v.assetDecimals ?? priceData.decimals);
            const tvlUsd =
              (toNumber(v.totalAssets) / 10 ** decimals) * priceData.price;

            // Calculate APY from weighted average of live underlying EVK strategy APYs
            let apyBase = null;
            const totalAllocated = (v.strategies || []).reduce(
              (sum, s) => sum + toNumber(s.allocatedAssets || 0),
              0
            );

            if (totalAllocated > 0 && v.strategies?.length > 0) {
              let weightedApy = 0;
              for (const s of v.strategies) {
                const allocated = toNumber(s.allocatedAssets || 0);
                if (allocated === 0) continue;
                const strategyApy =
                  earnStrategyApyMap[s.strategy.toLowerCase()] || 0;
                weightedApy += strategyApy * (allocated / totalAllocated);
              }
              // Apply performance fee
              const feePct = toNumber(v.performanceFee || 0) / 1e18;
              apyBase = weightedApy * (1 - feePct);
            }

            const earnAddr = ethersUtils.getAddress(v.vault);
            const earnAssetAddr = ethersUtils.getAddress(v.asset);
            return {
              pool: `euler-earn-${earnAddr}-${chain}`,
              chain,
              project: 'euler-v2',
              symbol,
              poolMeta: v.vaultName,
              tvlUsd,
              apyBase,
              underlyingTokens: [earnAssetAddr],
              url: `https://app.euler.finance/earn/${earnAddr}?network=${config.urlChain}`,
            };
          })
          .filter((p) => p && p.tvlUsd > 100);

        return [...evkPools, ...collateralRoutePools, ...earnPools];
      } catch (err) {
        console.error(`Error processing chain ${chain}:`, err.message || err);
        return [];
      }
    })
  );

  return await addMerklRewardApy(chainResults.flat(), 'euler', (p) => {
    if (p.poolKind === 'routing_collateral') return '';
    const match = p.pool.match(/0x[a-fA-F0-9]{40}/);
    return match ? match[0] : p.pool;
  });
};

module.exports = {
  protocolId: '5044',
  timetravel: false,
  apy: getApys,
};
