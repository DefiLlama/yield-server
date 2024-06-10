const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiPairFactory = require('./abiPairFactory.json');

const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');
const abiMultipoolSwap = require('./abiMultipoolSwap.json');

const pairFactory = '0x061FFE84B0F9E1669A6bf24548E5390DBf1e03b2';
const voter = '0xd14884b51Ff6cDa4F6f92f0fe7ac198C6c63BC7a';
const STRAT = '0x5a093a9c4f440c6b105F0AF7f7C4f1fBE45567f9';

const DEBUG = false;

const getApy = async () => {
    let chain = 'mantle';
    const poolsLength = (
        await sdk.api.abi.call({
            target: pairFactory,
            abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
            chain,
        })
    ).output;

    const pools = (
        await sdk.api.abi.multiCall({
            calls: [...Array(Number(poolsLength)).keys()].map((i) => ({
                target: pairFactory,
                params: [i],
            })),
            abi: abiPairFactory.find((m) => m.name === 'allPairs'),
            chain,
        })
    ).output.map((o) => o.output);

    const poolIsMultipool = (
        await sdk.api.abi.multiCall({
            calls: pools.map((p) => ({
                target: pairFactory,
                params: [p],
            })),
            abi: abiPairFactory.find((m) => m.name === 'is3pool'),
            chain,
        })
    ).output.map((o) => o.output);

    const poolFee = (
        await sdk.api.abi.multiCall({
            calls: pools.map((p) => ({
                target: pairFactory,
                params: [p],
            })),
            abi: abiPairFactory.find((m) => m.name === 'getFee' && m.inputs.length === 1),
            chain,
        })
    ).output.map((o) => o.output);

    // 
    // Pairs
    //

    const pairs = pools.filter((_, i) => !poolIsMultipool[i]);

    const pairMetaData = (
        await sdk.api.abi.multiCall({
            calls: pairs.map((pair) => ({
                target: pair,
            })),
            abi: abiPair.find((m) => m.name === 'metadata'),
            chain,
        })
    ).output.map((o) => o.output);


    // 
    // Multipools
    //

    const multipools = pools.filter((_, i) => poolIsMultipool[i]);

    const mpLpToken = (
        await sdk.api.abi.multiCall({
            calls: multipools.map((multipool) => ({
                target: multipool,
            })),
            abi: abiMultipoolSwap.find((m) => m.name === 'swapStorage'),
            chain,
        })
    ).output.map((o) => o.output[6]); // lpToken

    const mpPooledTokens = (
        await sdk.api.abi.multiCall({
            calls: multipools.map((multipool) => ({
                target: multipool,
            })),
            abi: abiMultipoolSwap.find((m) => m.name === 'getTokensArray'),
            chain,
        })
    ).output.map((o) => o.output);

    const mpTokenPermutation = mpPooledTokens.map((tokenArr, i) =>
        tokenArr.map((_, j) =>
            ({multipoolIndex: i, tokenIndex: j})
        )
    ).flat();
    const mpReserves = mpPooledTokens.map(tokenAddr => tokenAddr.map(_ => 0));
    (
        await sdk.api.abi.multiCall({
            calls: mpTokenPermutation.map(permutation => ({
                target: multipools[permutation.multipoolIndex],
                params: [permutation.tokenIndex]
            })),
            abi: abiMultipoolSwap.find((m) => m.name === 'getTokenBalance'),
            chain,
        })
    ).output.map((o) => o.output).forEach((balance, i) => {
        mpReserves[mpTokenPermutation[i].multipoolIndex][mpTokenPermutation[i].tokenIndex] = balance;
    });

    const mpUnderlyingTokenAddr = [...new Set(mpPooledTokens.flat())];
    const mpUnderlyingTokenAddrToSymbol = {};
    (
        await sdk.api.abi.multiCall({
            calls: mpUnderlyingTokenAddr.map(tokenAddr => ({
                target: tokenAddr
            })),
            abi: abiPair.find((m) => m.name === 'symbol'),
            chain,
        })
    ).output.map((o) => o.output).forEach((symbol, i) => {
        mpUnderlyingTokenAddrToSymbol[mpUnderlyingTokenAddr[i]] = symbol;
    });


    // 
    // Common (Pairs & Multipools)
    //

    const poolLpToken = pools.map((pool, i) => !poolIsMultipool[i] ? pool : mpLpToken[multipools.indexOf(pool)]);

    const poolSymbol = (
        await sdk.api.abi.multiCall({
            calls: poolLpToken.map(lpToken => ({
                target: lpToken,
            })),
            abi: abiPair.find((m) => m.name === 'symbol'),
            chain,
        })
    ).output.map((o) => o.output);

    const poolLpTotalSupply = (
        await sdk.api.abi.multiCall({
            calls: poolLpToken.map(lpToken => ({
                target: lpToken,
            })),
            abi: abiPair.find((m) => m.name === 'totalSupply'),
            chain,
        })
    ).output.map((o) => o.output);

    const poolGauge = (
        await sdk.api.abi.multiCall({
            calls: poolLpToken.map(lpToken => ({
                target: voter,
                params: [lpToken],
            })),
            abi: abiVoter.find((m) => m.name === 'gauges'),
            chain,
        })
    ).output.map((o) => o.output);

    const poolLpInGaugeBalance = (
        await sdk.api.abi.multiCall({
            calls: poolGauge.map((gauge, i) => ({
                target: poolLpToken[i],
                params: [gauge],
            })),
            abi: abiPair.find((m) => m.name === 'balanceOf'),
            chain,
        })
    ).output.map((o) => o.output);

    const poolGaugeStakingRatio = poolLpInGaugeBalance.map((balance, i) => balance / poolLpTotalSupply[i]);

    const poolRewardRate = (
        await sdk.api.abi.multiCall({
            calls: poolGauge.map(gauge => ({
                target: gauge,
                params: [STRAT],
            })),
            abi: abiGauge.find((m) => m.name === 'rewardRate'),
            chain,
            permitFailure: true,
        })
    ).output.map((o) => o.output);

    const tokens = [
        ...new Set(
            pairMetaData
                .map((m) => [m.t0, m.t1]).flat()
                .concat(mpPooledTokens.flat())
                .concat(STRAT)
        ),
    ];

    const decimalsOf = {};
    (
        await sdk.api.abi.multiCall({
            calls: tokens.map(token => ({
                target: token,
            })),
            abi: abiPair.find((m) => m.name === 'decimals'),
            chain,
            permitFailure: true,
        })
    ).output.map((o) => o.output).forEach((decimal, i) => {
        decimalsOf[tokens[i]] = decimal;
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

    const rewardTokenPriceUsd = prices[`mantle:${STRAT}`]?.price;

    const poolDescriptorsOfPairs = pairs.map((pair, i) => {

        const poolIndex = pools.indexOf(pair);

        const pairMeta = pairMetaData[i];
        const r0 = pairMeta.r0 / pairMeta.dec0;
        const r1 = pairMeta.r1 / pairMeta.dec1;

        const p0 = prices[`mantle:${pairMeta.t0}`]?.price;
        const p1 = prices[`mantle:${pairMeta.t1}`]?.price;

        const tvlUsd = r0 * p0 + r1 * p1;

        const rewardRate = poolRewardRate[poolIndex]; // STRAT per second
        const apyReward = poolGaugeStakingRatio[poolIndex] > 0 && tvlUsd > 0
            ? (rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd
                / tvlUsd / poolGaugeStakingRatio[poolIndex] * 100)
            : Number.POSITIVE_INFINITY;

        let pool = {
            pool: pair,
            chain: utils.formatChain(chain),
            project: 'stratum-exchange',
            symbol: utils.formatSymbol(poolSymbol[poolIndex].split('-')[1]),
            tvlUsd,
            apyReward,
            rewardTokens: apyReward ? [STRAT] : [],
            underlyingTokens: [pairMeta.t0, pairMeta.t1],
            poolMeta: pairMeta.st
                ? `sAMM: stable V2 pair ${poolFee[poolIndex] / 100}%`
                : `vAMM: volatile V2 pair ${poolFee[poolIndex] / 100}%`,
            url: `https://app.stratumexchange.com/liquidity/${pair}`,
        };
        if (DEBUG) {
            pool = {
                ...pool,
                type: pairMeta.st ? 'sAMM' : 'vAMM',
                gauge: poolGauge[poolIndex],
                gaugeStakingRatio: poolGaugeStakingRatio[poolIndex],
                locked0_USD: r0 * p0,
                locked1_USD: r1 * p1,
                rewardTokenPriceUsd,
                rewardRate,
                rewardRatePerSec: rewardRate / 1e18,
                rewardRatePerYear: rewardRate / 1e18 * 86400 * 365,
                rewardPerYearUsd: rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd,
                rewardPerYearUsdToTvlRatioPercent: rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd / tvlUsd * 100,
                rewardPerYearUsdToStakedTvlRatioPercent: rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd / tvlUsd / poolGaugeStakingRatio[poolIndex] * 100,
            };
        }
        return pool;
    });

    const poolDescriptorsOfMultipools = multipools.map((multipool, i) => {

        const poolIndex = pools.indexOf(multipool);

        let tvlUsd = 0;
        mpPooledTokens[i].forEach((tokenAddr, j) =>
            tvlUsd += (mpReserves[i][j] / (10 ** decimalsOf[tokenAddr]))
                * prices[`mantle:${tokenAddr}`]?.price
        );

        const rewardRate = poolRewardRate[poolIndex]; // STRAT per second
        const apyReward = poolGaugeStakingRatio[poolIndex] > 0 && tvlUsd > 0
            ? (rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd /
                tvlUsd / poolGaugeStakingRatio[poolIndex] * 100)
            : Number.POSITIVE_INFINITY;

        const customSymbol = mpPooledTokens[i].map(tokenAddr => mpUnderlyingTokenAddrToSymbol[tokenAddr]).join('-');

        let pool = {
            pool: multipool,
            chain: utils.formatChain(chain),
            project: 'stratum-exchange',
            symbol: utils.formatSymbol(customSymbol),
            tvlUsd,
            apyReward,
            rewardTokens: apyReward ? [STRAT] : [],
            underlyingTokens: mpPooledTokens[i],
            poolMeta: `multipool (curve style) ${poolFee[poolIndex] / 100}%`,
            url: `https://app.stratumexchange.com/liquidity/${multipool}`,
        };
        if (DEBUG) {
            pool = {
                ...pool,
                type: 'multipool',
                lpToken: mpLpToken[i],
                tokens: mpPooledTokens[i],
                reserves: mpReserves[i],
                gauge: poolGauge[poolIndex],
                gaugeStakingRatio: poolGaugeStakingRatio[poolIndex],
                rewardTokenPriceUsd,
                rewardRate,
                rewardRatePerSec: rewardRate / 1e18,
                rewardRatePerYear: rewardRate / 1e18 * 86400 * 365,
                rewardPerYearUsd: rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd,
                rewardPerYearUsdToTvlRatioPercent: rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd / tvlUsd * 100,
                rewardPerYearUsdToStakedTvlRatioPercent: rewardRate / 1e18 * 86400 * 365 * rewardTokenPriceUsd / tvlUsd / poolGaugeStakingRatio[poolIndex] * 100,
            };
        }
        return pool;
    });

    return [...poolDescriptorsOfPairs, ...poolDescriptorsOfMultipools]
        .filter((p) => utils.keepFinite(p));
};

module.exports = {
    timetravel: true,
    apy: getApy,
    url: 'https://app.stratumexchange.com/liquidity',
};
