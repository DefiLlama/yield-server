const utils = require('../utils');


const poolsFunction = async () => {
    const apyData = await utils.getData(
        'https://v2-srv-data-frm-smrt-cntract.herokuapp.com/get/getReserveData'
    );

    //Pools return stable APR

    const celoPool = {
        pool: '0x7D00cd74FF385c955EA3d79e47BF06bD7386387D',
        chain: utils.formatChain('celo'),
        project: 'moola',
        symbol: utils.formatSymbol('Celo'),
        tvlUsd: Number(apyData.data[0].totalDeposited),
        apy: apyData.data[0].stableBorrowAPR,
    };
    const cUSDPool = {
        pool: '0x918146359264C492BD6934071c6Bd31C854EDBc3',
        chain: utils.formatChain('celo'),
        project: 'moola',
        symbol: utils.formatSymbol('cUSD'),
        tvlUsd: Number(apyData.data[1].totalDeposited),
        apy: apyData.data[1].stableBorrowAPR,
    };
    const cEURPool = {
        pool: '0xE273Ad7ee11dCfAA87383aD5977EE1504aC07568',
        chain: utils.formatChain('celo'),
        project: 'moola',
        symbol: utils.formatSymbol('cEUR'),
        tvlUsd: Number(apyData.data[2].totalDeposited),
        apy: apyData.data[2].stableBorrowAPR,
    };
    const cREALPool = {
        pool: '0x9802d866fdE4563d088a6619F7CeF82C0B991A55',
        chain: utils.formatChain('celo'),
        project: 'moola',
        symbol: utils.formatSymbol('cREAL'),
        tvlUsd: Number(apyData.data[3].totalDeposited),
        apy: apyData.data[3].stableBorrowAPR,
    };
    const cMOOPool = {
        pool: '0x3A5024E3AAB31A1d3184127B52b0e4B4E9ADcC34',
        chain: utils.formatChain('celo'),
        project: 'moola',
        symbol: utils.formatSymbol('MOO'),
        tvlUsd: Number(apyData.data[4].totalDeposited),
        apy: apyData.data[4].stableBorrowAPR,
    };


    return [celoPool,cUSDPool,cEURPool,cREALPool,cMOOPool];
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
};