const lendingPoolABI = require('./lending-pool.json');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');
const abi = require('./abi')
const { getMerklRewardsForChain } = require('../merkl/merkl-by-identifier');

const APYRegistry = "0x3161676467636Ce9027AC16268Fd351861b052b4";
const nativeToken = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

const chainMapping = {
    ethereum: { chainId: '1', secondsPerBlock: 12 },
    avax: { chainId: '43114', secondsPerBlock: 2 },
    base: { chainId: '8453', secondsPerBlock: 2 },
    hyperliquid: { chainId: '999', secondsPerBlock: 2 },
    monad: { chainId: '143', secondsPerBlock: 1 },
};

const projectName = 'upshift';

// Pools not yet in the APYRegistry but should be tracked
const extraPools = {
    hyperliquid: [
        '0xc061d38903b99aC12713B550C2CB44B221674F94', // hbBTC
    ],
    monad: [
        '0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA', // earnAUSD
    ],
};

// Vaults with non-standard interfaces (e.g. transparent proxies where ERC20 reverts)
const customVaults = {
    '0x36eDbF0C834591BFdfCaC0Ef9605528c75c406aA': {
        symbol: 'earnAUSD',
        decimals: 6,
        underlying: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a', // AUSD
        underlyingDecimals: 6,
        totalAssetsAbi: { inputs: [], name: 'getTotalAssets', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
        sharePriceAbi: { inputs: [], name: 'getSharePrice', outputs: [{ type: 'uint256' }], stateMutability: 'view', type: 'function' },
        merklIdentifier: '0x103222f020e98Bba0AD9809A011FDF8e6F067496', // lpTokenAddress used by Merkl
    },
};

const SECONDS_PER_DAY = 86400;
const LOOKBACK_DAYS = 7;

const convertToAssetsAbi = {
    inputs: [{ type: 'uint256', name: 'shares' }],
    name: 'convertToAssets',
    outputs: [{ type: 'uint256', name: 'assets' }],
    stateMutability: 'view',
    type: 'function',
};

// Batch-fetch 7d share prices for all pools on a chain, used as apyBase fallback when registry has no data
const calcApyBase7dBatch = async (standardPools, customPoolAddrs, vaultData, chainKey) => {
    const result = {};
    try {
        const { secondsPerBlock } = chainMapping[chainKey];
        const blocksPerDay = SECONDS_PER_DAY / secondsPerBlock;
        const lookbackBlocks = Math.floor(blocksPerDay * LOOKBACK_DAYS);
        const currentBlock = (await sdk.api.util.getLatestBlock(chainKey)).number;
        const olderBlock = currentBlock - lookbackBlocks;

        // Standard vaults: batch convertToAssets at current and historical block
        if (standardPools.length > 0) {
            const calls = standardPools.map(p => ({
                target: p,
                params: [ethers.BigNumber.from(10).pow(vaultData[p].decimals).toString()],
            }));

            const [currentRes, olderRes] = await Promise.all([
                sdk.api.abi.multiCall({ calls, abi: convertToAssetsAbi, chain: chainKey, permitFailure: true }),
                sdk.api.abi.multiCall({ calls, abi: convertToAssetsAbi, chain: chainKey, block: olderBlock, permitFailure: true }),
            ]);

            for (let i = 0; i < standardPools.length; i++) {
                const curr = Number(currentRes.output[i]?.output);
                const old = Number(olderRes.output[i]?.output);
                if (old > 0 && curr > 0) {
                    result[standardPools[i]] = ((curr - old) / old) * (365 / LOOKBACK_DAYS) * 100;
                }
            }
        }

        // Custom vaults: individual calls with their custom sharePriceAbi
        for (const addr of customPoolAddrs) {
            const cv = customVaults[addr];
            if (!cv.sharePriceAbi) continue;
            try {
                const [curr, old] = await Promise.all([
                    sdk.api.abi.call({ target: addr, abi: cv.sharePriceAbi, chain: chainKey }),
                    sdk.api.abi.call({ target: addr, abi: cv.sharePriceAbi, chain: chainKey, block: olderBlock }),
                ]);
                const currVal = Number(curr.output);
                const oldVal = Number(old.output);
                if (oldVal > 0 && currVal > 0) {
                    result[addr] = ((currVal - oldVal) / oldVal) * (365 / LOOKBACK_DAYS) * 100;
                }
            } catch {}
        }
    } catch {}
    return result;
};

const getPoolUrl = (pool, chain) =>
    `https://app.upshift.finance/pools/${chainMapping[chain].chainId}/${pool}`;

const getApy = async () => {
    const poolInfos = [];
    const getPoolsAbi = abi.find(a => a.name === 'getPools');
    const getPoolInfoAbi = abi.find(a => a.name === 'getPoolInfo');
    const symbolAbi = lendingPoolABI.find(a => a.name === 'symbol');
    const assetAbi = lendingPoolABI.find(a => a.name === 'asset');
    const totalAssetsAbi = lendingPoolABI.find(a => a.name === 'totalAssets');

    for (const [chainKey, config] of Object.entries(chainMapping)) {
        try {
            const registryPools = (await sdk.api.abi.call({
                target: APYRegistry,
                params: [config.chainId],
                abi: getPoolsAbi,
                chain: 'base'
            })).output;

            const allPools = [...new Set([...registryPools, ...(extraPools[chainKey] || [])])];
            if (allPools.length === 0) continue;

            // Separate standard and custom vaults
            const standardPools = allPools.filter(p => !customVaults[p]);
            const customPoolAddrs = allPools.filter(p => customVaults[p]);

            // Batch on-chain calls for standard vaults
            const [symbolsRes, assetsRes, totalAssetsRes, decimalsRes] = standardPools.length > 0
                ? await Promise.all([
                    sdk.api.abi.multiCall({ calls: standardPools.map(p => ({ target: p })), abi: symbolAbi, chain: chainKey }),
                    sdk.api.abi.multiCall({ calls: standardPools.map(p => ({ target: p })), abi: assetAbi, chain: chainKey }),
                    sdk.api.abi.multiCall({ calls: standardPools.map(p => ({ target: p })), abi: totalAssetsAbi, chain: chainKey }),
                    sdk.api.abi.multiCall({ calls: standardPools.map(p => ({ target: p })), abi: 'erc20:decimals', chain: chainKey }),
                ])
                : [{ output: [] }, { output: [] }, { output: [] }, { output: [] }];

            // Build vault data map
            const vaultData = {};
            for (let i = 0; i < standardPools.length; i++) {
                const addr = standardPools[i];
                vaultData[addr] = {
                    symbol: symbolsRes.output[i].output,
                    underlying: assetsRes.output[i].output,
                    totalAssets: totalAssetsRes.output[i].output,
                    decimals: decimalsRes.output[i].output,
                };
            }

            // Fetch custom vault totalAssets
            for (const addr of customPoolAddrs) {
                const cv = customVaults[addr];
                const totalAsset = (await sdk.api.abi.call({
                    target: addr, abi: cv.totalAssetsAbi, chain: chainKey,
                }))?.output;
                vaultData[addr] = {
                    symbol: cv.symbol,
                    underlying: cv.underlying,
                    totalAssets: totalAsset,
                    decimals: cv.decimals,
                    underlyingDecimals: cv.underlyingDecimals,
                };
            }

            // Batch fetch underlying decimals for standard vaults
            const underlyingAddrs = standardPools.map(p => vaultData[p].underlying);
            if (underlyingAddrs.length > 0) {
                const uDecimalsRes = await sdk.api.abi.multiCall({
                    calls: underlyingAddrs.map(a => ({ target: a })),
                    abi: 'erc20:decimals',
                    chain: chainKey,
                });
                for (let i = 0; i < standardPools.length; i++) {
                    vaultData[standardPools[i]].underlyingDecimals = uDecimalsRes.output[i].output;
                }
            }

            // Batch price fetch, APY registry, Merkl rewards, and 7d share prices in parallel
            const allUnderlying = [...new Set(allPools.map(p => vaultData[p].underlying))];
            const merklIdentifiers = allPools.map(p => customVaults[p]?.merklIdentifier || p);

            const [prices, apyRegistryRes, merklRewards, apyBase7dMap] = await Promise.all([
                utils.getPrices(allUnderlying, chainKey),
                sdk.api.abi.multiCall({
                    calls: allPools.map(p => ({ target: APYRegistry, params: [p] })),
                    abi: getPoolInfoAbi,
                    chain: 'base',
                }),
                getMerklRewardsForChain(merklIdentifiers, chainKey),
                calcApyBase7dBatch(standardPools, customPoolAddrs, vaultData, chainKey),
            ]);

            // Build pool results
            for (let i = 0; i < allPools.length; i++) {
                const addr = allPools[i];
                const data = vaultData[addr];
                const custom = customVaults[addr];
                const registryInfo = apyRegistryRes.output[i].output;

                const underlyingPrice = prices.pricesByAddress[data.underlying.toLowerCase()];
                if (!underlyingPrice) continue;

                const tvlUsd = Number(ethers.utils.formatUnits(data.totalAssets, data.underlyingDecimals)) * underlyingPrice;

                let apyBase = registryInfo.apyBase / 100;
                const apyReward = registryInfo.apyReward / 100;
                // Fallback: use 7d share price APY when registry has no data
                if (apyBase === 0 && apyReward === 0 && apyBase7dMap[addr]) {
                    apyBase = apyBase7dMap[addr];
                }

                const result = {
                    pool: `${addr}-${utils.formatChain(chainKey)}`,
                    chain: utils.formatChain(chainKey),
                    project: projectName,
                    symbol: data.symbol,
                    tvlUsd,
                    apyBase,
                    underlyingTokens: [data.underlying],
                    url: getPoolUrl(addr, chainKey),
                };

                if (apyReward > 0) {
                    const rewardToken = registryInfo.rewardToken === nativeToken
                        ? ethers.constants.AddressZero
                        : registryInfo.rewardToken;
                    result.apyReward = apyReward;
                    result.rewardTokens = [rewardToken];
                }

                // Add Merkl rewards if available and not already set
                if (!result.apyReward) {
                    const rewards = merklRewards[merklIdentifiers[i].toLowerCase()];
                    if (rewards?.apyReward > 0) {
                        result.apyReward = rewards.apyReward;
                        result.rewardTokens = rewards.rewardTokens;
                    }
                }

                poolInfos.push(result);
            }
        } catch (e) {
            console.log(`Error processing chain ${chainKey}:`, e.message);
        }
    }

    return poolInfos.filter(p => utils.keepFinite(p));
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://www.upshift.finance/'
};
