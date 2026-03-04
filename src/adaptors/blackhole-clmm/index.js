const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

// Blackhole CL (Algebra) on Avalanche
const gaugeManager = '0x59aa177312Ff6Bdf39C8Af6F46dAe217bf76CBf6';
const BLACK = '0xcd94a87696FAC69Edae3a70fE5725307Ae1c43f6';
const nullAddress = '0x0000000000000000000000000000000000000000';
const PROJECT = 'blackhole-clmm';
const CHAIN = 'avax';
const SUBGRAPH =
    'https://api.goldsky.com/api/public/project_cm8gyxv0x02qv01uphvy69ey6/subgraphs/poap-subgraph-core/avax-main/gn';

// ABI fragments for on-chain gauge calls
const abiGaugeManager = [
    {
        inputs: [{ internalType: 'address', name: '', type: 'address' }],
        name: 'gauges',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function',
    },
];

const abiGaugeCL = [
    {
        inputs: [],
        name: 'rewardRate',
        outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
        stateMutability: 'view',
        type: 'function',
    },
];

const query = gql`
{
  pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
    id
    reserve0: totalValueLockedToken0
    reserve1: totalValueLockedToken1
    volumeUSD
    untrackedVolumeUSD
    volumeToken0
    fee
    tickSpacing
    token0 {
      symbol
      id
      decimals
    }
    token1 {
      symbol
      id
      decimals
    }
  }
}
`;

const queryPrior = gql`
{
  pools(first: 1000 orderBy: totalValueLockedUSD orderDirection: desc, block: {number: <PLACEHOLDER>}) { 
    id 
    volumeUSD
    volumeToken0
    untrackedVolumeUSD
  }
}
`;

function getActiveAmounts({
    liquidity,
    currentTick,
    tickSpacing,
    decimals0,
    decimals1
}) {
    const tickLower =
        Math.floor(currentTick / tickSpacing) * tickSpacing

    const tickUpper = tickLower + tickSpacing

    const sqrtLower = 1.0001 ** (tickLower / 2)
    const sqrtUpper = 1.0001 ** (tickUpper / 2)
    const sqrtPrice = 1.0001 ** (currentTick / 2)

    const amount0_raw =
        liquidity * (sqrtUpper - sqrtPrice) /
        (sqrtPrice * sqrtUpper)

    const amount1_raw =
        liquidity * (sqrtPrice - sqrtLower)

    return {
        amount0: amount0_raw / (10 ** decimals0),
        amount1: amount1_raw / (10 ** decimals1),
        tickLower,
        tickUpper
    }
}

async function getPoolVolumes(timestamp = null) {
    const [block, blockPrior] = await utils.getBlocks(CHAIN, timestamp, [
        SUBGRAPH,
    ]);

    const [_, blockPrior7d] = await utils.getBlocks(
        CHAIN,
        timestamp,
        [SUBGRAPH],
        604800
    );

    // pull data
    const dataNowResp = await request(SUBGRAPH, query.replace('<PLACEHOLDER>', block)).catch((e) => {
        console.error('Failed to fetch dataNow:', e.message);
        return { pools: [] };
    });
    let dataNow = dataNowResp.pools;

    // pull 24h offset data to calculate fees from swap volume
    let queryPriorC = queryPrior;
    const dataPriorResp = await request(
        SUBGRAPH,
        queryPriorC.replace('<PLACEHOLDER>', blockPrior)
    ).catch((e) => {
        console.error('Failed to fetch dataPrior:', e.message);
        return { pools: [] };
    });
    let dataPrior = dataPriorResp.pools;

    // 7d offset
    const dataPrior7dResp = await request(
        SUBGRAPH,
        queryPriorC.replace('<PLACEHOLDER>', blockPrior7d)
    ).catch((e) => {
        console.error('Failed to fetch dataPrior7d:', e.message);
        return { pools: [] };
    });
    const dataPrior7d = dataPrior7dResp.pools;
    // Use on-chain balances for accurate CL TVL
    const balanceCalls = [];
    for (const pool of dataNow) {
        balanceCalls.push({ target: pool.token0.id, params: pool.id });
        balanceCalls.push({ target: pool.token1.id, params: pool.id });
    }

    const tokenBalances = await sdk.api.abi.multiCall({
        abi: 'erc20:balanceOf',
        calls: balanceCalls,
        chain: CHAIN,
        permitFailure: true,
    });

    dataNow = dataNow.map((p) => {
        const x = tokenBalances.output.filter((i) => i.input.params[0] === p.id);
        const t0 = x.find((i) => i.input.target === p.token0.id);
        const t1 = x.find((i) => i.input.target === p.token1.id);
        return {
            ...p,
            reserve0: t0 && t0.output ? t0.output / 10 ** Number(p.token0.decimals) : p.reserve0,
            reserve1: t1 && t1.output ? t1.output / 10 ** Number(p.token1.decimals) : p.reserve1,
        };
    });

    // calculate tvl
    dataNow = await utils.tvl(dataNow, CHAIN);
    // Algebra fee is in hundredths of bip – map to feeTier for utils.apy

    const pools = {}
    for (const p of dataNow) {
        const poolType = Number(p.tickSpacing) > 1 ? 'Concentrated%20Volatile' : 'Concentrated%20Stable';
        const url = `https://blackhole.xyz/deposit?token0=${p.token0.id}&token1=${p.token1.id}&pair=${p.id}&type=${poolType}`;
        const feePercent = (Number(p.fee) / 1e6) * 100;
        const poolMeta = 'CL' + ' - ' + p.tickSpacing;
        const underlyingTokens = [p.token0.id, p.token1.id];

        const p1d = dataPrior.find((i) => i.id === p.id);
        const p7d = dataPrior7d.find((i) => i.id === p.id);
        const volumeUsd1d = p1d ? Number(p.untrackedVolumeUSD) - Number(p1d.untrackedVolumeUSD) : Number(p.untrackedVolumeUSD);
        const volumeUsd7d = p7d ? Number(p.untrackedVolumeUSD) - Number(p7d.untrackedVolumeUSD) : Number(p.untrackedVolumeUSD);

        const poolAddress = utils.formatAddress(p.id);
        pools[poolAddress] = {
            pool: poolAddress,
            chain: utils.formatChain(CHAIN),
            project: PROJECT,
            poolMeta,
            symbol: `${p.token0.symbol}-${p.token1.symbol}`,
            tvlUsd: p.totalValueLockedUSD,
            apyBase: 0,
            apyBase7d: 0,
            underlyingTokens,
            url,
            volumeUsd1d,
            volumeUsd7d,
        }
    }

    return pools;
}

const getGaugeApy = async () => {
    // Get all CL pools from Algebra subgraph
    const { pools: subgraphPools } = await request(
        SUBGRAPH,
        gql`
      {
        pools(
          first: 1000
          orderBy: totalValueLockedUSD
          orderDirection: desc
        ) {
          id
          fee
          tickSpacing
          totalValueLockedUSD
          liquidity
          tick
          token0 {
            id
            symbol
            decimals
          }
          token1 {
            id
            symbol
            decimals
          }
        }
      }
    `
    );

    const poolAddresses = subgraphPools.map((p) => p.id);

    // Look up gauges for each pool via GaugeManager
    const gaugeResults = (
        await sdk.api.abi.multiCall({
            calls: poolAddresses.map((addr) => ({
                target: gaugeManager,
                params: [addr],
            })),
            abi: abiGaugeManager[0],
            chain: CHAIN,
            permitFailure: true,
        })
    ).output.map((o) => o.output);

    // Filter to pools with valid gauges
    const validPools = [];
    const validGauges = [];
    gaugeResults.forEach((gauge, i) => {
        if (gauge && gauge !== nullAddress) {
            validPools.push(subgraphPools[i]);
            validGauges.push(gauge);
        }
    });

    if (validPools.length === 0) return {};

    // Fetch rewardRate from each GaugeCL
    const rewardRates = (
        await sdk.api.abi.multiCall({
            calls: validGauges.map((g) => ({ target: g })),
            abi: abiGaugeCL[0],
            chain: CHAIN,
            permitFailure: true,
        })
    ).output.map((o) => o.output);

    // Fetch on-chain token balances for TVL
    const balanceCalls = [];
    for (const pool of validPools) {
        balanceCalls.push({ target: pool.token0.id, params: pool.id });
        balanceCalls.push({ target: pool.token1.id, params: pool.id });
    }

    const tokenBalances = (
        await sdk.api.abi.multiCall({
            abi: 'erc20:balanceOf',
            calls: balanceCalls,
            chain: CHAIN,
            permitFailure: true,
        })
    ).output;

    // Fetch prices
    const tokens = [
        ...new Set(
            validPools
                .map((p) => [p.token0.id, p.token1.id])
                .flat()
                .concat(BLACK)
        ),
    ];

    const { pricesByAddress: prices } = await utils.getPrices(tokens, CHAIN);

    // fallback for BLACK price if not on defillama
    if (!prices[BLACK.toLowerCase()]) {
        try {
            const basicSubgraph = 'https://api.goldsky.com/api/public/project_cm8gyxv0x02qv01uphvy69ey6/subgraphs/blackhole-basic-pools-avalanche-c-chain-new-1/avax-basic/gn';
            const blackUsdcPool = '0x0d9fd6dd9b1ff55fb0a9bb0e5f1b6a2d65b741a3';
            const { pair } = await request(
                basicSubgraph,
                gql`
                {
                    pair(id: "${blackUsdcPool}") {
                        token0 { id }
                        token1 { id }
                        token0Price
                        token1Price
                    }
                }
                `
            );

            if (pair) {
                if (pair.token1.id.toLowerCase() === BLACK.toLowerCase() && pair.token1Price) {
                    prices[BLACK.toLowerCase()] = Number(pair.token1Price);
                } else if (pair.token0.id.toLowerCase() === BLACK.toLowerCase() && pair.token0Price) {
                    prices[BLACK.toLowerCase()] = Number(pair.token0Price);
                }
            }
        } catch (e) {
            console.error('Failed to fetch fallback BLACK price:', e.message);
        }
    }

    const pools = validPools.map((p, i) => {
        const poolType = Number(p.tickSpacing) > 1 ? 'Concentrated%20Volatile' : 'Concentrated%20Stable';
        const url = `https://blackhole.xyz/deposit?token0=${p.token0.id}&token1=${p.token1.id}&pair=${p.id}&type=${poolType}`;
        const balT0 = tokenBalances.find(
            (b) => b.input.params[0] === p.id && b.input.target === p.token0.id
        );
        const balT1 = tokenBalances.find(
            (b) => b.input.params[0] === p.id && b.input.target === p.token1.id
        );

        const r0 = balT0 && balT0.output ? balT0.output / 10 ** Number(p.token0.decimals) : 0;
        const r1 = balT1 && balT1.output ? balT1.output / 10 ** Number(p.token1.decimals) : 0;

        const p0 = prices[p.token0.id.toLowerCase()] || 0;
        const p1 = prices[p.token1.id.toLowerCase()] || 0;

        const tvlUsd = r0 * p0 + r1 * p1;

        const activeAmounts = getActiveAmounts({
            liquidity: Number(p.liquidity),
            currentTick: Number(p.tick),
            tickSpacing: Number(p.tickSpacing),
            decimals0: Number(p.token0.decimals),
            decimals1: Number(p.token1.decimals)
        });

        const activeTvlUsd = activeAmounts.amount0 * p0 + activeAmounts.amount1 * p1;

        const blackPrice = prices[BLACK.toLowerCase()] || 0;
        const apyReward =
            activeTvlUsd > 0 && blackPrice > 0 && rewardRates[i] && rewardRates[i] !== '0'
                ? ((rewardRates[i] / 1e18) * 86400 * 365 * blackPrice * 100) / activeTvlUsd
                : 0;

        const s = p.token0.symbol + '-' + p.token1.symbol;
        const feePercent = (Number(p.fee) / 1e6) * 100;
        const poolMeta = 'CL' + ' - ' + p.tickSpacing;

        return {
            pool: utils.formatAddress(p.id),
            chain: utils.formatChain(CHAIN),
            project: PROJECT,
            symbol: s,
            tvlUsd,
            apyReward,
            rewardTokens: apyReward ? [BLACK] : [],
            underlyingTokens: [p.token0.id.toLowerCase(), p.token1.id.toLowerCase()],
            poolMeta,
            url,
        };
    });

    const poolsApy = {};
    for (const pool of pools.filter((p) => utils.keepFinite(p))) {
        poolsApy[pool.pool] = pool;
    }

    return poolsApy;
};

async function main(timestamp = null) {
    const poolsApy = await getGaugeApy();

    let poolsVolumes = {};
    try {
        poolsVolumes = await getPoolVolumes(timestamp);
    } catch (e) {
        console.log('Failed to fetch volume data from subgraph:', e.message);
    }

    // left-join volumes onto APY output to avoid filtering out pools
    return Object.values(poolsApy).map((pool) => {
        const v = poolsVolumes[pool.pool];
        return {
            ...pool,
            apyBase: 0,
            apyBase7d: 0,
            volumeUsd1d: isFinite(v?.volumeUsd1d) ? v.volumeUsd1d : 0,
            volumeUsd7d: isFinite(v?.volumeUsd7d) ? v.volumeUsd7d : 0,
        };
    });
}

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://blackhole.xyz/liquidity',
};
