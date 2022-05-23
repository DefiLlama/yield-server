const utils = require('../utils');

const savingsPool = '0xAF985437DCA19DEFf89e61F83Cd526b272523719';
const { default: BigNumber } = require('bignumber.js');

const savingsPoolABI = require('./abis/savings_pool_abi.json');
const sdk = require("@defillama/sdk");

const projectName = 'Mover';


const savings = async () => {

    const chain = 'ethereum';

    // get asset price in usd
    const price = await utils.getCGpriceData('usd-coin', true);
    const usdcInUSD = price['usd-coin'].usd;

    let tvl = new BigNumber((await sdk.api.abi.call({
        target: savingsPool,
        abi: savingsPoolABI.totalAssetAmount,
    })).output);

    tvl = tvl.div(1e6).multipliedBy(usdcInUSD);


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
        tvlUsd: tvl.toFixed(0),
        apy: apy.toFixed(2)
    };
};

const main = async () => {
    const data = await Promise.all([savings()]);
    const res = data.flat();
    console.log(res);
    return res;
};

module.exports = {
    timetravel: false,
    apy: main,
};