const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const axios = require('axios');
const abi = require('./abis.json');

const investor = '0x8accf43Dd31DfCd4919cc7d65912A475BfA60369';
const investorHelper = '0x6f456005A7CfBF0228Ca98358f60E6AE1d347E18';
const allPools = [
    {
        asset: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
        address: "0x0032F5E1520a66C6E572e96A11fBF54aea26f9bE",
        slug: "usdc-v1",
    },
];

const strategies = [
    '0x6A77FEC52D8575AC70F5196F833bd4A6c86c81AE',
    '0x81E37797D44d348E664247298Faa6A90Db90C1B9',
    '0x70116D50c89FC060203d1fA50374CF1B816Bd0f5',
    '0xCE0488a9FfD70156d8914C02D95fA320DbBE93Ab',
    '0xbA8A58Fd6fbc9fAcB8BCf349C94B87717a4BC00f',
    '0x9FA6CaCcE3f868E56Bdab9be85b0a90e2568104d',
    '0x390358DEf53f2316671ed3B13D4F4731618Ff6A3',
    '0x6d98F80D9Cfb549264B4B7deD12426eb6Ea47800',
    '0xcF03B33851F088d58E921d8aB5D60Dc1c3238758',
    '0x05CBD8C4F171247aa8F4dE87b3d9e09883beD511',
    '0xFE280C65c328524132205cDd360781484D981e42',
    '0xd170cFfd7501bEc329B0c90427f06C9156845Be4'
]

const poolInfo = async (chain) => {
    const yieldPools = allPools.map((pool) => {
        return { ...pool };
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
    peekPools.map(i => console.log(i, 'peekPools>>>>'));

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
    peekPoolInfos.map(i => console.log(i, 'peekPoolInfos>>>>'));

    const getOutput = ({ output }) => output.map(({ output }) => output);
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
        pool.gearPerBlock = "";
        pool.availableLiquidity = peekPools[i].output[0][2];
        pool.totalBorrowed = peekPools[i].output[0][3];
        pool.depositAPY_RAY = peekPools[i].output[0][1];
        pool.borrowAPY_RAY = "";
        pool.underlyingToken = underlyingTokens[i];
        pool.withdrawFee = "";
        pool.symbol = symbol[i];
        pool.price = peekPools[i].output[0][5];
        pool.decimals = dTokenDecimals[i];
    });

    return { yieldPools };
};

function calculateApy(apys) {
    return 0;
}

function calculateTvl(availableLiquidity, totalBorrowed, price, decimals) {

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
        const totalSupplyUsd = 0;
        const totalBorrowUsd = 0;
        const tvlUsd = totalSupplyUsd - totalBorrowUsd;
        const LpRewardApy = calculateApy(historyApys);

        return (readyToExport = exportFormatter(
            pool.address,
            'Arbitrum',
            symbol[i],
            tvlUsd,
            (pool.depositAPY_RAY / 1e27) * 100,
            LpRewardApy,
            pool.underlyingToken,
            [allPools[0].asset],
            `https://www.rodeofinance.xyz/api/pools/history?address=${pool.address}`,
            (pool.borrowAPY_RAY / 1e27) * 100,
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
