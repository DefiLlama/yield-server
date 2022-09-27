const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const abi = require("./abis.json");

const unitroller = "0x4F96AB61520a6636331a48A11eaFBA8FB51f74e4";


const poolInfo = async (chain) => {

    const allMarkets = await sdk.api.abi.call({ target: unitroller, chain, abi: abi.getAllMarkets });

    const supplyRatePerBlock = (await sdk.api.abi.multiCall({
        abi: abi.supplyRatePerBlock,
        calls: allMarkets.output.map(token => ({
            target: token
        })),
        chain
    })).output.map((markets) => markets.output);

    const yieldMarkets = allMarkets.output.map((poolId, i) => {
        const supplyRate = Number(supplyRatePerBlock[i]);
        return { poolId, supplyRate };
    }).filter((pool) => pool.supplyRate > 1000000);

    const [cash, borrows, reserves, underlying, symbol] = await Promise.all(
        ['getCash', 'totalBorrows', 'totalReserves', 'underlying', 'symbol'].map((method) => sdk.api.abi.multiCall({
            abi: abi[method],
            calls: yieldMarkets.map((address) => ({
                target: address.poolId
            })),
            chain
        }))
    );
    const [getCash, totalBorrows, totalReserves, underlyingToken, tokenSymbol] =
        [cash.output, borrows.output, reserves.output, underlying.output, symbol.output].map((data) => data.map((d) => d.output));

    const underlyingTokenDecimals = (await sdk.api.abi.multiCall({
        abi: abi.decimals,
        calls: underlyingToken.map(token => ({
            target: token
        })),
        chain
    })).output.map((decimal) => Math.pow(10, Number(decimal.output)));

    const price = await getPrices('ethereum', underlyingToken);

    yieldMarkets.map((data, i) => {
        data.getCash = getCash[i];
        data.totalBorrows = totalBorrows[i];
        data.totalReserves = totalReserves[i];
        data.underlyingToken = underlyingToken[i];
        data.tokenSymbol = tokenSymbol[i];
        data.price = price[underlyingToken[i].toLowerCase()];
        data.underlyingTokenDecimals = underlyingTokenDecimals[i];
    });

    return { yieldMarkets };
};

const getPrices = async (chain, addresses) => {
    const prices = (
        await superagent.post('https://coins.llama.fi/prices').send({
            coins: addresses.map((address) => `${chain}:${address}`),
        })
    ).body.coins;

    const pricesObj = Object.entries(prices).reduce(
        (acc, [address, price]) => ({
            ...acc,
            [address.split(':')[1].toLowerCase()]: price.price,
        }),
        {}
    );

    return pricesObj;
};

function calculateApy(rate) {
    // supply rate per block * number of blocks per year
    const BLOCK_TIME = 12;
    const YEARLY_BLOCKS = 365 * 24 * 60 * 60 / BLOCK_TIME;
    const apy = ((rate / 1e18) * YEARLY_BLOCKS) * 100;
    return apy;
};

function calculateTvl(cash, borrows, price, decimals) {
    // ( cash + totalBorrows - reserve value ) * underlying price = balance
    const tvl = (parseFloat(cash) + parseFloat(borrows)) / decimals * price;
    return tvl;
};

const getApy = async () => {

    const yieldPools = (await poolInfo('ethereum')).yieldMarkets.map((pool, i) => {
        const tvl = calculateTvl(pool.getCash, pool.totalBorrows, pool.price, pool.underlyingTokenDecimals);
        const apyBase = calculateApy(pool.supplyRate);
        const readyToExport = exportFormatter(pool.poolId, 'Ethereum', pool.tokenSymbol, tvl, apyBase, null, pool.underlyingToken);
        return readyToExport;
    });

    return yieldPools;
};

function exportFormatter(poolId, chain, symbol, tvlUsd, apyBase, apyReward, underlyingTokens) {

    return {
        pool: `${poolId}-${chain}`.toLowerCase(),
        chain,
        project: 'damm-finance',
        symbol,
        tvlUsd,
        apyBase,
        apyReward,
        underlyingTokens: [underlyingTokens],
    };
};


module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://app.damm.finance/dashboard',
};