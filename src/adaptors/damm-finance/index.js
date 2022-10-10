const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const abi = require("./abis.json");

const unitroller = "0x4F96AB61520a6636331a48A11eaFBA8FB51f74e4";
const bdAMM = "0xfa372fF1547fa1a283B5112a4685F1358CE5574d";


const poolInfo = async (chain) => {

    const allMarkets = await sdk.api.abi.call({ target: unitroller, chain, abi: abi.getAllMarkets });

    const compSpeedsPerBlock = (await sdk.api.abi.multiCall({
        abi: abi.compSpeeds,
        target: unitroller,
        calls: allMarkets.output.map(token => ({
            params: token
        })),
        chain
    })).output.map((speeds) => speeds.output);

    const yieldMarkets = allMarkets.output.map((pool) => {
        return { pool };
    });

    const getOutput = ({ output }) => output.map(({ output }) => output);
    const [supplyRatePerBlock, getCash, totalBorrows, totalReserves, underlyingToken, tokenSymbol] = await Promise.all(
        ['supplyRatePerBlock', 'getCash', 'totalBorrows', 'totalReserves', 'underlying', 'symbol'].map((method) => sdk.api.abi.multiCall({
            abi: abi[method],
            calls: yieldMarkets.map((address) => ({
                target: address.pool
            })),
            chain
        }))
    ).then((data) => data.map(getOutput));

    const underlyingTokenDecimals = (await sdk.api.abi.multiCall({
        abi: abi.decimals,
        calls: underlyingToken.map(token => ({
            target: token
        })),
        chain
    })).output.map((decimal) => Math.pow(10, Number(decimal.output)));

    const price = await getPrices('ethereum', underlyingToken);

    yieldMarkets.map((data, i) => {
        data.supplyRate = supplyRatePerBlock[i];
        data.compSpeeds = compSpeedsPerBlock[i];
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

const getTerminalPrices = async (chain, addresses) => {
    const key = 'ethereum:0xfa372ff1547fa1a283b5112a4685f1358ce5574d';
    const prices = (
      await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
    ).body.coins[key].price;
    return prices;
  };
  

function calculateApy(rate, price = 1, tvl = 1) {
    // supply rate per block * number of blocks per year
    const BLOCK_TIME = 12;
    const YEARLY_BLOCKS = 365 * 24 * 60 * 60 / BLOCK_TIME;
    const apy = ((rate / 1e18) * YEARLY_BLOCKS * price / tvl) * 100;
    return apy;
};

function calculateTvl(cash, borrows, price, decimals) {
    // ( cash + totalBorrows - reserve value ) * underlying price = balance
    const tvl = (parseFloat(cash) + parseFloat(borrows)) / decimals * price;
    return tvl;
};

const getApy = async () => {
    const bdammPrice = await getTerminalPrices();
    const yieldPools = (await poolInfo('ethereum')).yieldMarkets.map((pool, i) => {
        const tvl = calculateTvl(pool.getCash, pool.totalBorrows, pool.price, pool.underlyingTokenDecimals);
        const apyBase = calculateApy(pool.supplyRate);
        const apyReward = calculateApy(pool.compSpeeds, bdammPrice, tvl);
        const readyToExport = exportFormatter(pool.pool, 'Ethereum', pool.tokenSymbol, tvl, apyBase, apyReward, pool.underlyingToken, [bdAMM]);
        return readyToExport;
    });

    return yieldPools;
};

function exportFormatter(pool, chain, symbol, tvlUsd, apyBase, apyReward, underlyingTokens, rewardTokens) {

    return {
        pool: `${pool}-${chain}`.toLowerCase(),
        chain,
        project: 'damm-finance',
        symbol,
        tvlUsd,
        apyBase,
        apyReward,
        underlyingTokens: [underlyingTokens],
        rewardTokens,
    };
};


module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://app.damm.finance/dashboard',
};