const sdk = require('@defillama/sdk');
const axios = require('axios');
const abi = require('./abis.json');

const investorHelper = '0x6f456005A7CfBF0228Ca98358f60E6AE1d347E18';
const allPools = [
    {
        asset: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        address: "0x0032F5E1520a66C6E572e96A11fBF54aea26f9bE",
        slug: "usdc-v1",
    },
];

const YEAR = (365 * 24 * 60 * 60);
const weiDecimals = 1000000000000000000;


const poolInfo = async (chain) => {
    const yieldPools = allPools.map((pool) => {
        return {...pool};
    });

    const peekPools = (
        await sdk.api.abi.multiCall({
            target: investorHelper,
            chain,
            abi: abi.peekPools,
            calls: yieldPools.map((pool) => ({
                params: [[pool.address]],
            })),
        })
    ).output;

    const peekPoolInfos = (
        await sdk.api.abi.multiCall({
            target: investorHelper,
            chain,
            abi: abi.peekPoolInfos,
            calls: yieldPools.map((pool) => ({
                params: [[pool.address]],
            })),
        })
    ).output;

    const getOutput = ({output}) => output.map(({output}) => output);
    const [symbol, decimals] = await Promise.all(
        ['symbol', 'decimals'].map((method) =>
            sdk.api.abi.multiCall({
                abi: abi[method],
                calls: yieldPools.map((token, i) => ({
                    target: peekPoolInfos[i].output[0][0],
                })),
                chain,
            })
        )
    ).then((data) => data.map(getOutput));
    const dTokenDecimals = decimals.map((decimal) =>
        Math.pow(10, Number(decimal))
    );

    const underlyingTokens = peekPoolInfos.map((pool) => pool.output[0][0]);

    yieldPools.map((pool, i) => {

        const values = peekPools[i].output;

        pool.index = values[0][0];
        pool.share = values[1][0];
        pool.supply = values[2][0];
        pool.borrow = values[3][0];
        pool.rate = values[4][0];
        pool.price = values[5][0];
        pool.utilization = 0;
        pool.underlyingToken = underlyingTokens[i];
        pool.symbol = symbol[i];
        pool.decimals = dTokenDecimals[i];

        if (pool.supply > 0) {
            pool.utilization = pool.borrow / pool.supply;
        }
    });

    return {yieldPools};
};

function calculateTvl(amount, price, decimals) {
    // amount * underlying price = total pool balance in USD
    const tvl = (parseFloat(amount) / decimals) * (price / weiDecimals);
    return tvl;
}

const getApy = async () => {
    const yieldPools = (await poolInfo('arbitrum')).yieldPools;

    const historyApys = (
        await axios.get(`https://www.rodeofinance.xyz/api/apys/history`)
    ).data;

    const symbol = (
        await sdk.api.abi.multiCall({
            abi: 'erc20:symbol',
            calls: yieldPools.map((p) => ({ target: p.underlyingToken })),
            chain: 'arbitrum',
        })
    ).output.map((o) => o.output);

    const pools = yieldPools.map((pool, i) => {

        const totalSupplyUsd = calculateTvl(
            pool.supply,
            pool.price,
            pool.decimals
        );
        const totalBorrowUsd = calculateTvl(
            pool.borrow,
            pool.price,
            pool.decimals
        );

        const tvlUsd = totalSupplyUsd - totalBorrowUsd;

        const borrowAPR = pool.rate * YEAR / weiDecimals * 100;
        const lendingAPR = pool.rate * YEAR * pool.utilization / weiDecimals * 100;

        return (readyToExport = exportFormatter(
            pool.address,
            'Arbitrum',
            symbol[i],
            tvlUsd,
            lendingAPR,
            0,
            pool.underlyingToken,
            [allPools[0].asset],
            `https://www.rodeofinance.xyz/farm`,
            borrowAPR,
            0,
            totalSupplyUsd,
            totalBorrowUsd,
            0
        ));
    });

    return pools;
};

function exportFormatter(
    pool,
    chain,
    symbol,
    tvlUsd,
    apyBase,
    apyReward,
    underlyingToken,
    rewardTokens,
    url,
    apyBaseBorrow,
    apyRewardBorrow,
    totalSupplyUsd,
    totalBorrowUsd,
    ltv
) {
    return {
        pool,
        chain,
        project: 'rodeo',
        symbol,
        tvlUsd,
        apyBase,
        apyReward,
        underlyingTokens: [underlyingToken],
        rewardTokens,
        url,
        apyBaseBorrow,
        apyRewardBorrow,
        totalSupplyUsd,
        totalBorrowUsd,
        ltv,
    };
}

module.exports = {
    timetravel: false,
    apy: getApy,
};
