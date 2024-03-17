const sdk = require('@defillama/sdk5');
const axios = require('axios');

const utils = require('../utils');

const abiPairFactory = require('./abiPairFactory.json');

const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');
const abiMultipoolSwap = require('./abiMultipoolSwap.json');
const abiMultipoolLPToken = require('./abiMultipoolLPToken.json');

const pairFactory = '0x061FFE84B0F9E1669A6bf24548E5390DBf1e03b2';
const voter = '0xd14884b51Ff6cDa4F6f92f0fe7ac198C6c63BC7a';
const STRAT = '0x5a093a9c4f440c6b105F0AF7f7C4f1fBE45567f9';

const getApy = async () => {
    let chain = 'mantle';
    const allPoolsLength = (
        await sdk.api.abi.call({
            target: pairFactory,
            abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
            chain,
        })
    ).output;

    const allPools = (
        await sdk.api.abi.multiCall({
            calls: [...Array(Number(allPoolsLength)).keys()].map((i) => ({
                target: pairFactory,
                params: [i],
            })),
            abi: abiPairFactory.find((m) => m.name === 'allPairs'),
            chain,
        })
    ).output.map((o) => o.output);

    const isMultipool = (
        await sdk.api.abi.multiCall({
            calls: allPools.map((p) => ({
                target: pairFactory,
                params: [p],
            })),
            abi: abiPairFactory.find((m) => m.name === 'is3pool'),
            chain,
        })
    ).output.map((o) => o.output);

    const fee = (
        await sdk.api.abi.multiCall({
            calls: allPools.map((p) => ({
                target: pairFactory,
                params: [p],
            })),
            abi: abiPairFactory.find((m) => m.name === 'getFee' && m.inputs.length === 1),
            chain,
        })
    ).output.map((o) => o.output);
    const pool2fee = {};
    allPools.forEach((pool, i) => pool2fee[pool] = fee[i]);

    // 
    // Pairs
    //

    const allPairs = allPools.filter((_, i) => !isMultipool[i]);

    const metaDataOfPairs = (
        await sdk.api.abi.multiCall({
            calls: allPairs.map((pair) => ({
                target: pair,
            })),
            abi: abiPair.find((m) => m.name === 'metadata'),
            chain,
        })
    ).output.map((o) => o.output);

    const symbolsOfPairs = (
        await sdk.api.abi.multiCall({
            calls: allPairs.map((pair) => ({
                target: pair,
            })),
            abi: abiPair.find((m) => m.name === 'symbol'),
            chain,
        })
    ).output.map((o) => o.output);


    // 
    // Multipools
    //

    const allMultipools = allPools.filter((_, i) => isMultipool[i]);

    const lpTokenOfMultipools = (
        await sdk.api.abi.multiCall({
            calls: allMultipools.map((multipool) => ({
                target: multipool,
            })),
            abi: abiMultipoolSwap.find((m) => m.name === 'swapStorage'),
            chain,
        })
    ).output.map((o) => o.output[6]); // lpToken

    const symbolsOfMultipools = (
        await sdk.api.abi.multiCall({
            calls: lpTokenOfMultipools.map((lpToken) => ({
                target: lpToken,
            })),
            abi: abiMultipoolLPToken.find((m) => m.name === 'symbol'),
            chain,
        })
    ).output.map((o) => o.output);

    const pooledTokensOfMultipools = (
        await sdk.api.abi.multiCall({
            calls: allMultipools.map((multipool) => ({
                target: multipool,
            })),
            abi: abiMultipoolSwap.find((m) => m.name === 'getTokensArray'),
            chain,
        })
    ).output.map((o) => o.output);

    const multipoolTokenPermutations = pooledTokensOfMultipools.map((tokenArr, i) =>
        tokenArr.map((_, j) => {
            return {multipoolIndex: i, tokenIndex: j}
        })
    ).flat();
    const multipoolBalancesFlat = (
        await sdk.api.abi.multiCall({
            calls: multipoolTokenPermutations.map(permutation => ({
                target: allMultipools[permutation.multipoolIndex],
                params: [permutation.tokenIndex]
            })),
            abi: abiMultipoolSwap.find((m) => m.name === 'getTokenBalance'),
            chain,
        })
    ).output.map((o) => o.output);
    const multipoolBalances = pooledTokensOfMultipools.map(tokenAddr => tokenAddr.map(_ => 0));
    multipoolBalancesFlat.forEach((balance, i) => {
        multipoolBalances[multipoolTokenPermutations[i].multipoolIndex][multipoolTokenPermutations[i].tokenIndex] = balance;
    });


    // 
    // Common (Pairs & Multipools)
    //

    const gauges = (
        await sdk.api.abi.multiCall({
            calls: allPools.map((i) => ({
                target: voter,
                params: [i],
            })),
            abi: abiVoter.find((m) => m.name === 'gauges'),
            chain,
        })
    ).output.map((o) => o.output);

    const rewardRate = (
        await sdk.api.abi.multiCall({
            calls: gauges.map((i) => ({
                target: i,
            })),
            abi: abiGauge.find((m) => m.name === 'rewardRate'),
            chain,
            permitFailure: true,
        })
    ).output.map((o) => o.output);

    const tokens = [
        ...new Set(
            metaDataOfPairs
                .map((m) => [m.t0, m.t1]).flat()
                .concat(pooledTokensOfMultipools.flat())
                .concat(STRAT)
        ),
    ];

    const decimals = (
        await sdk.api.abi.multiCall({
            calls: tokens.map(token => ({
                target: token,
            })),
            abi: {
                "inputs": [], "name": "decimals",
                "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
                "stateMutability": "view", "type": "function"
            },
            chain,
            permitFailure: true,
        })
    ).output.map((o) => o.output);

    const token2decimals = {};
    tokens.forEach((token, i) => {
        token2decimals[token] = decimals[i];
    });

    const maxSize = 50;
    const pages = Math.ceil(tokens.length / maxSize);
    let pricesA = [];
    let x = '';
    for (const p of [...Array(pages).keys()]) {
        x = tokens
            .slice(p * maxSize, maxSize * (p + 1))
            .map((i) => `mantle:${i}`)
            .join(',')
            .replaceAll('/', '');
        pricesA = [
            ...pricesA,
            (await axios.get(`https://coins.llama.fi/prices/current/${x}`)).data
                .coins,
        ];
    }
    let prices = {};
    for (const p of pricesA.flat()) {
        prices = {...prices, ...p};
    }


    // 
    // Generate resulting SDK Pool objects
    //

    const poolDescriptorsOfPairs = allPairs.map((p, i) => {
        const pairMeta = metaDataOfPairs[i];
        const r0 = pairMeta.r0 / pairMeta.dec0;
        const r1 = pairMeta.r1 / pairMeta.dec1;

        const p0 = prices[`mantle:${pairMeta.t0}`]?.price;
        const p1 = prices[`mantle:${pairMeta.t1}`]?.price;

        const tvlUsd = r0 * p0 + r1 * p1;

        const apyReward =
            (((rewardRate[i] / 1e18) * 86400 * 365 * prices[`mantle:${STRAT}`]?.price) /
                tvlUsd) * 100;

        return {
            pool: p,
            chain: utils.formatChain(chain),
            project: 'stratum-exchange',
            symbol: utils.formatSymbol(symbolsOfPairs[i].split('-')[1]),
            tvlUsd,
            apyReward,
            rewardTokens: apyReward ? [STRAT] : [],
            underlyingTokens: [pairMeta.t0, pairMeta.t1],
            poolMeta: pairMeta.st
                ? `sAMM: stable V2 pair ${pool2fee[p] / 100}%`
                : `vAMM: volatile V2 pair ${pool2fee[p] / 100}%`,
            url: `https://app.stratumexchange.com/liquidity/${p.split('-')[0]}`,
        };
    });

    const poolDescriptorsOfMultipools = allMultipools.map((p, i) => {
        const tvlUsd = pooledTokensOfMultipools[i].sum((tokenAddr, j) =>
            (multipoolBalances[i][j] / (10 ** token2decimals[tokenAddr]))
            * prices[`mantle:${tokenAddr}`]?.price
        );

        const apyReward =
            (((rewardRate[i] / 1e18) * 86400 * 365 * prices[`mantle:${STRAT}`]?.price) /
                tvlUsd) * 100;

        return {
            pool: p,
            chain: utils.formatChain(chain),
            project: 'stratum-exchange',
            symbol: utils.formatSymbol(symbolsOfMultipools[i]),
            tvlUsd,
            apyReward,
            rewardTokens: apyReward ? [STRAT] : [],
            underlyingTokens: pooledTokensOfMultipools[i],
            poolMeta: `multipool (curve style) ${pool2fee[p] / 100}%`,
            url: `https://app.stratumexchange.com/liquidity/${p.split('-')[0]}`,
        };
    });

    return [...poolDescriptorsOfPairs, ...poolDescriptorsOfMultipools]
        .filter((p) => utils.keepFinite(p));
};

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://app.stratumexchange.com/liquidity',
};
