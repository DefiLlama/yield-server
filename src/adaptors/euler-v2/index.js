const axios = require('axios');
const { utils: ethersUtils } = require('ethers');

const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

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
  },
  bob: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-bob/latest/gn`,
    urlChain: 'bob',
  },
  sonic: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-sonic/latest/gn`,
    urlChain: 'sonic',
  },
  avax: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-avalanche/latest/gn`,
    urlChain: 'avalanche',
  },
  berachain: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-berachain/latest/gn`,
    urlChain: 'berachain',
  },
  bsc: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-bsc/latest/gn`,
    urlChain: 'bnbsmartchain',
  },
  base: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-base/latest/gn`,
    urlChain: 'base',
  },
  swellchain: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-swell/latest/gn`,
    urlChain: 'swellchain',
  },
  unichain: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-unichain/latest/gn`,
    urlChain: 'unichain',
  },
  arbitrum: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-arbitrum/latest/gn`,
    urlChain: 'arbitrumone',
  },
  linea: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-linea/latest/gn`,
    urlChain: 'lineamainnet',
  },
  // TAC subgraph lacks the vault state entity (no supplyApy/borrowApy) -- excluded until updated
  monad: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-monad/latest/gn`,
    urlChain: 'monad',
  },
  plasma: {
    subgraph: `${SUBGRAPH_BASE}/euler-v2-plasma/latest/gn`,
    urlChain: 'plasma',
  },
};

// Subgraph APY values are 27-decimal fixed-point; dividing by 1e25 gives percentage
const APY_DIVISOR = 1e25;

// EVK vault symbol format is "e{ASSET_SYMBOL}-{N}" (e.g. "eUSDC-80", "ewstETH-2")
const parseAssetSymbol = (vaultSymbol) =>
  vaultSymbol.replace(/^e/, '').replace(/-\d+$/, '');

const EVK_QUERY = `{
  eulerVaults(first: 1000) {
    id
    name
    symbol
    asset
    decimals
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

const getApys = async () => {
  const chainResults = await Promise.all(
    Object.entries(chains).map(async ([chain, config]) => {
      try {
        // Fetch EVK and Earn vaults from subgraph in parallel
        const [evkData, earnData] = await Promise.all([
          querySubgraph(config.subgraph, EVK_QUERY),
          querySubgraph(config.subgraph, EARN_QUERY).catch(() => ({
            eulerEarnVaults: [],
          })),
        ]);

        const evkVaults = evkData.eulerVaults || [];
        const earnVaults = earnData.eulerEarnVaults || [];

        // Build maps from ALL EVK vaults (active or not) for Earn vault lookups
        const evkApyMap = {};
        const assetInfoMap = {};
        for (const v of evkVaults) {
          if (v.state && Number(v.state.supplyApy) > 0) {
            evkApyMap[v.id] = Number(v.state.supplyApy) / APY_DIVISOR;
          }
          if (!assetInfoMap[v.asset]) {
            assetInfoMap[v.asset] = {
              symbol: parseAssetSymbol(v.symbol),
              decimals: Number(v.decimals),
            };
          }
        }

        // Filter to active vaults for pool output
        const activeEvkVaults = evkVaults.filter(
          (v) => v.state && Number(v.state.supplyApy) > 0
        );

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
              url: `https://app.euler.finance/vault/${vaultAddr}?network=${config.urlChain}`,
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
              url: `https://app.euler.finance/vault/${earnAddr}?network=${config.urlChain}`,
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

  return await addMerklRewardApy(chainResults.flat(), 'euler');
};

module.exports = {
  timetravel: false,
  apy: getApys,
};

// ===========================================================================
// PREVIOUS IMPLEMENTATION (event logs + lens contracts)
// Preserved for reference. Can be restored if subgraph becomes unavailable.
// Issues with this approach:
//   - Scanned millions of blocks per chain on every run (fromBlock -> latest)
//   - getVaultInfoFull multicalls returned ~40 fields per vault (most unused)
//   - Oversized multicalls caused failures on bob, sonic
//   - Rate limiting on tac, timeouts on swellchain
// ===========================================================================
/*
const axios = require('axios');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');

const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const lensAbi = require('./lens.abi.json');
const earnLensAbi = require('./eulerEarnLens.abi.json');

const EVENTS = {
  ProxyCreated:
    'event ProxyCreated(address indexed proxy, bool upgradeable, address implementation, bytes trailingData)',
  CreateEulerEarn:
    'event CreateEulerEarn(address indexed eulerEarn, address indexed caller, address initialOwner, uint256 initialTimelock, address indexed asset, string name, string symbol, bytes32 salt)',
};

const chains = {
  ethereum: {
    factory: '0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e',
    vaultLens: '0x83801C7BbeEFa54B91F8A07E36D81515a0Fc5b60',
    earnFactory: '0x59709B029B140C853FE28d277f83C3a65e308aF4',
    earnLens: '0xA09144BeAe23D8e7836Aeb0Fe17DD2647241A8bE',
    fromBlock: 20529225,
  },
  bob: {
    factory: '0x046a9837A61d6b6263f54F4E27EE072bA4bdC7e4',
    vaultLens: '0xC6B56a52e5823659d90F3020164b92D1c2de03CE',
    earnFactory: '0x8F01c6640A1c0a6085C79843F861fF0F89b9fED6',
    earnLens: '0x68329B651555cCE5F7fdEE65b19D3ede27A6Ddc0',
    fromBlock: 12266832,
  },
  sonic: {
    factory: '0xF075cC8660B51D0b8a4474e3f47eDAC5fA034cFB',
    vaultLens: '0x4c7BA548032FE3eA11b7D6BeaF736B3B74F69248',
    earnFactory: '0x3397ec7d28cF645A017869Fe4B41c75f5B0b75a8',
    earnLens: '0x69ea21940D6E4C832Ac5e3dDbd9D57e0C89835E6',
    fromBlock: 5324454,
  },
  avax: {
    factory: '0xaf4B4c18B17F6a2B32F6c398a3910bdCD7f26181',
    vaultLens: '0xcC5F7593a4D5974F84A30B28Bd3fdb374319a254',
    earnFactory: '0x574B00f5a0C56D370F19fa887a5545d74F52fAC2',
    earnLens: '0xF4e5897F8Fc9faC2FfB876fe7cA8050b7e594af7',
    fromBlock: 56805794,
  },
  berachain: {
    factory: '0x5C13fb43ae9BAe8470f646ea647784534E9543AF',
    vaultLens: '0x2ffd260BAd257C08516B649c93Ea3eb6b63a5639',
    earnFactory: '0x9cbc3030e6d133D1AAa148D598FD82D70263495c',
    earnLens: '0x1bE8646294d8f81Af01DF1e018Ae55D5Be22A81B',
    fromBlock: 786314,
  },
  bsc: {
    factory: '0x7F53E2755eB3c43824E162F7F6F087832B9C9Df6',
    vaultLens: '0x84641751808f85F54344369036594E1a7301a414',
    earnFactory: '0xc456d04E3F43597CC7E5a2AF284fF4C4AdDA0cb1',
    earnLens: '0x8fA7030A7d19714DBDc5104217861aF69fc05Cf3',
    fromBlock: 46370655,
  },
  base: {
    factory: '0x7F321498A801A191a93C840750ed637149dDf8D0',
    vaultLens: '0x3530dA02ceC2818477888FdC77e777b566B6db4C',
    earnFactory: '0x75F49a2621b6DeC6a5baB22ce961bF3e676EFAE6',
    earnLens: '0xF9469493Ac510436D9B50dc400cB4E23d5F64070',
    fromBlock: 22282408,
  },
  swellchain: {
    factory: '0x238bF86bb451ec3CA69BB855f91BDA001aB118b9',
    vaultLens: '0x94Dd6A076838D6Fc5031e32138b95d810793DB1c',
    earnFactory: '0x3073e1B42f8Cc933f2d678DdA10acDE51F4E49a3',
    earnLens: '0xF8Bfc6be3302458dfd27DF369ACD68358CaA3Cb2',
    fromBlock: 2350701,
  },
  unichain: {
    factory: '0xbAd8b5BDFB2bcbcd78Cc9f1573D3Aad6E865e752',
    vaultLens: '0xd40DD19eD88a949436f784877A1BB59660ee8DE3',
    earnFactory: '0xD785adD5F081F56616898E45b90dE307e3DC7d3E',
    earnLens: '0x49A5918CcC21F8252281aCf622f2c564d8F711d1',
    fromBlock: 8541544,
  },
  arbitrum: {
    factory: '0x78Df1CF5bf06a7f27f2ACc580B934238C1b80D50',
    vaultLens: '0x59d28aF1fC4A52EE402C9099BeCEf333366184Df',
    earnFactory: '0xB9B5d62B9fE9E1B505466e75817aB178A1D2ec9d',
    earnLens: '0xb0Fb95690a068DE87d60cAF050c2e8815154B97c',
    fromBlock: 300690953,
  },
  linea: {
    factory: '0x84711986Fd3BF0bFe4a8e6d7f4E22E67f7f27F04',
    vaultLens: '0xd20E9D6cfa0431aC306cC9906896a7BC0BE0Db64',
    earnFactory: '0x377879A039343FEc7564e54616e519328951DA6D',
    earnLens: '0x6e3762b38eF77E181686C0FDb87c6bA20F2244eF',
    fromBlock: 17915340,
  },
  tac: {
    factory: '0x2b21621b8Ef1406699a99071ce04ec14cCd50677',
    vaultLens: '0x70d9bc0aBd4EF6Ceb7C88875b9cf4013db3D780A',
    earnFactory: '0x7670572aa76E6140400A948e7AAFAB0210a86d9f',
    earnLens: '0x31b5fCDE4713890c6FA58C4679D3B3f1bB9613a9',
    fromBlock: 555116,
  },
  monad: {
    factory: '0xba4Dd672062dE8FeeDb665DD4410658864483f1E',
    vaultLens: '0x15d1Cc54fB3f7C0498fc991a23d8Dc00DF3c32A0',
    earnFactory: '0xF463d4Acb650cc6C4E1D6cD4D0d1b0cb224094cF',
    earnLens: '0x618b0954b83Fa24A18FB650D80FC3bAbD162c4A2',
    fromBlock: 30858651,
  },
  plasma: {
    factory: '0x42388213C6F56D7E1477632b58Ae6Bba9adeEeA3',
    vaultLens: '0x62FF27a1fBE6024D2933A88D39E0FF877dB4FE0B',
    earnFactory: '0xA3843A73e6a9F81309B931237Ca4759B3B02ff0E',
    earnLens: '0xC203f5DEb8d2D138F4E53a1783dEba079cA64ab0',
    fromBlock: 4733826,
  },
};

const chainNameMapping = {
  ethereum: 'ethereum',
  bob: 'bob',
  sonic: 'sonic',
  avax: 'avalanche',
  berachain: 'berachain',
  bsc: 'bnbsmartchain',
  base: 'base',
  swellchain: 'swellchain',
  unichain: 'unichain',
  arbitrum: 'arbitrumone',
  linea: 'lineamainnet',
  tac: 'tac',
  monad: 'monad',
  plasma: 'plasma',
};

const CHAIN_TIMEOUT_MS = 120_000;

const getLogsWithTimeout = (params, chain) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out fetching logs for ${chain}`)),
      CHAIN_TIMEOUT_MS
    );
  });

  return Promise.race([sdk.getEventLogs(params), timeoutPromise]).finally(
    () => clearTimeout(timer)
  );
};

const getApys = async () => {
  const chainResults = await Promise.all(
    Object.entries(chains).map(async ([chain, config]) => {
      try {
        const currentBlock = await sdk.api.util.getLatestBlock(chain);
        const toBlock = currentBlock.number;

        const [poolDeployEvents, earnDeployEvents] = await Promise.all([
          getLogsWithTimeout(
            {
              fromBlock: config.fromBlock,
              toBlock: toBlock,
              target: config.factory,
              chain: chain,
              eventAbi: EVENTS.ProxyCreated,
            },
            chain
          ),
          getLogsWithTimeout(
            {
              fromBlock: config.fromBlock,
              toBlock: toBlock,
              target: config.earnFactory,
              chain: chain,
              eventAbi: EVENTS.CreateEulerEarn,
            },
            chain
          ).catch(() => []),
        ]);

        const vaultAddresses = poolDeployEvents.map((event) => event.args.proxy);
        const earnAddresses = earnDeployEvents.map(
          (event) => event.args.eulerEarn
        );

        const [vaultInfosRaw, earnInfosRaw] = await Promise.all([
          sdk.api.abi
            .multiCall({
              calls: vaultAddresses.map((address) => ({
                target: config.vaultLens,
                params: [address],
              })),
              abi: lensAbi.find((m) => m.name === 'getVaultInfoFull'),
              chain,
              permitFailure: true,
            })
            .then((r) => r.output.map((o) => o.output)),
          earnAddresses.length > 0
            ? sdk.api.abi
                .multiCall({
                  calls: earnAddresses.map((address) => ({
                    target: config.earnLens,
                    params: [address],
                  })),
                  abi: earnLensAbi.find((m) => m.name === 'getVaultInfoFull'),
                  chain,
                  permitFailure: true,
                })
                .then((r) => r.output.map((o) => o.output))
                .catch(() => [])
            : Promise.resolve([]),
        ]);

        const vaultInfosFiltered = vaultInfosRaw.filter(
          (i) => i?.irmInfo?.interestRateInfo[0]?.supplyAPY > 0
        );

        const evkApyMap = {};
        for (const i of vaultInfosFiltered) {
          if (i?.vault && i?.irmInfo?.interestRateInfo[0]?.supplyAPY) {
            evkApyMap[i.vault.toLowerCase()] = Number(
              ethers.utils.formatUnits(
                i.irmInfo.interestRateInfo[0].supplyAPY,
                25
              )
            );
          }
        }

        const evkPriceKeys = vaultInfosFiltered
          .map((i) => `${chain}:${i.asset}`)
          .join(',');

        const earnInfosFiltered = earnInfosRaw.filter(
          (i) => i && i.totalAssets && i.totalAssets !== '0'
        );

        const earnPriceKeys = earnInfosFiltered
          .map((i) => `${chain}:${i.asset}`)
          .join(',');

        const allPriceKeys = [evkPriceKeys, earnPriceKeys]
          .filter(Boolean)
          .join(',');

        if (!allPriceKeys) return [];

        const { data: prices } = await axios.get(
          `https://coins.llama.fi/prices/current/${allPriceKeys}`
        );

        const evkPools = vaultInfosFiltered
          .map((i) => {
            const price = prices.coins[`${chain}:${i.asset}`]?.price;
            if (price === undefined || price === null) return null;

            const totalSupplied = i.totalAssets;
            const totalBorrowed = i.totalBorrowed;

            const totalSuppliedUSD =
              ethers.utils.formatUnits(totalSupplied, i.assetDecimals) * price;
            const totalBorrowedUSD =
              ethers.utils.formatUnits(totalBorrowed, i.assetDecimals) * price;

            return {
              pool: i.vault,
              chain,
              project: 'euler-v2',
              symbol: i.assetSymbol,
              poolMeta: i.vaultName,
              tvlUsd: totalSuppliedUSD - totalBorrowedUSD,
              totalSupplyUsd: totalSuppliedUSD,
              totalBorrowUsd: totalBorrowedUSD,
              apyBase: Number(
                ethers.utils.formatUnits(
                  i.irmInfo.interestRateInfo[0].supplyAPY,
                  25
                )
              ),
              apyBaseBorrow: Number(
                ethers.utils.formatUnits(
                  i.irmInfo.interestRateInfo[0].borrowAPY,
                  25
                )
              ),
              underlyingTokens: [i.asset],
              url: `https://app.euler.finance/vault/${i.vault}?network=${chainNameMapping[chain]}`,
            };
          })
          .filter(Boolean);

        const earnPools = earnInfosFiltered
          .map((i) => {
            const price = prices.coins[`${chain}:${i.asset}`]?.price;
            if (price === undefined || price === null) return null;

            const tvlUsd =
              ethers.utils.formatUnits(i.totalAssets, i.assetDecimals) * price;

            let apyBase = null;
            const totalAllocated = i.strategies?.reduce(
              (sum, s) => sum + Number(s.allocatedAssets || 0),
              0
            );

            if (totalAllocated > 0 && i.strategies?.length > 0) {
              let weightedApy = 0;
              for (const strategy of i.strategies) {
                const allocated = Number(strategy.allocatedAssets || 0);
                if (allocated === 0) continue;
                const strategyApy =
                  evkApyMap[strategy.strategy.toLowerCase()] || 0;
                weightedApy += strategyApy * (allocated / totalAllocated);
              }
              const feePct = Number(i.performanceFee || 0) / 1e18;
              apyBase = weightedApy * (1 - feePct);
            }

            return {
              pool: `euler-earn-${i.vault}-${chain}`,
              chain,
              project: 'euler-v2',
              symbol: i.assetSymbol,
              poolMeta: i.vaultName,
              tvlUsd,
              apyBase,
              underlyingTokens: [i.asset],
              url: `https://app.euler.finance/vault/${i.vault}?network=${chainNameMapping[chain]}`,
            };
          })
          .filter((p) => p && p.tvlUsd > 100);

        return [...evkPools, ...earnPools];
      } catch (err) {
        console.error(`Error processing chain ${chain}:`, err);
        return [];
      }
    })
  );

  return await addMerklRewardApy(chainResults.flat(), 'euler');
};

module.exports = {
  timetravel: false,
  apy: getApys,
};
*/
