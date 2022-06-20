const utils = require('../utils');

const savingsPool = '0xAF985437DCA19DEFf89e61F83Cd526b272523719';
const savingsPlusPolygonPool = "0x77D5333d97A092cA01A783468E53E550C379dc3C";
const USDCinPolygon = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";


const { default: BigNumber } = require('bignumber.js');

const savingsPoolABI = require('./abis/savings_pool_abi.json');
const savingsPlusPoolAbi = require("./abis/savings_plus_pool_abi.json");

const sdk = require("@defillama/sdk");

const projectName = 'Mover';


const savings = async () => {

    const chain = 'ethereum';

    // get asset price in usd
    const pricesFromEth = await utils.getCGpriceData('usd-coin', true);

    const usdcInUSDEth = pricesFromEth['usd-coin'].usd;


    let tvl = new BigNumber((await sdk.api.abi.call({
        target: savingsPool,
        abi: savingsPoolABI.totalAssetAmount,
    })).output);

    tvl = tvl.div(1e6).multipliedBy(usdcInUSDEth);


    let apy = new BigNumber((await sdk.api.abi.call({
        target: savingsPool,
        abi: savingsPoolABI.getDailyAPY,
    })).output);


    apy = apy.multipliedBy(365).div(new BigNumber(1e18));

    return {
        pool: savingsPool,
        chain: utils.formatChain(chain),
        project: projectName,
        symbol: utils.formatSymbol('USDC'),
        tvlUsd: parseInt(tvl.toFixed(0)),
        apy: parseFloat(apy.toFixed(2))
    };
};


const savingsPlus = async () => {

    const chain = 'polygon';

    // get asset price in usd
    const pricesFromPolygon = await utils.getCGpriceData(USDCinPolygon, false, 'polygon-pos');

    const usdcInUSDPolygon = pricesFromPolygon[USDCinPolygon.toLowerCase()].usd;

    let tvl = new BigNumber((await sdk.api.abi.call({
        chain: 'polygon',
        target: savingsPlusPolygonPool,
        abi: savingsPlusPoolAbi.totalAssetAmount,
    })).output);

    tvl = tvl.div(1e6).multipliedBy(usdcInUSDPolygon);


    let apy = new BigNumber((await sdk.api.abi.call({
        chain: 'polygon',
        target: savingsPlusPolygonPool,
        abi: savingsPlusPoolAbi.getDailyAPY,
    })).output);

    // 1651230270 - April 29 - pool started
    // after 20 days - first strategy
    const inceptionTimestamp= 1651230270;
    const koef = (Date.now()/1000 - inceptionTimestamp)
        /  (Date.now()/1000 - inceptionTimestamp - 20 * 24 * 3600);

    apy = apy.multipliedBy(new BigNumber(koef)).div(new BigNumber(1e18)).multipliedBy(365);

    return {
        pool: savingsPlusPolygonPool,
        chain: utils.formatChain(chain),
        project: projectName,
        symbol: utils.formatSymbol('USDC'),
        tvlUsd: parseInt(tvl.toFixed(0)),
        apy: parseFloat(apy.toFixed(2))
    };
};


const main = async () => {
    const data = await Promise.all([savings(), savingsPlus()]);
    return data.flat();
};

module.exports = {
    timetravel: false,
    apy: main,
};