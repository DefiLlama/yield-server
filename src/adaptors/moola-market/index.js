const utils = require('../utils');


const poolsFunction = async () => {
    const apyData = await utils.getData(
        'https://v2-srv-data-frm-smrt-cntract.herokuapp.com/get/getReserveData'
    );

    let dataPool = []

    for(let i in apyData.data){
        dataPool.push({
            pool: '',
            chain: utils.formatChain('celo'),
            project: 'moola-market',
            symbol: utils.formatSymbol(apyData.data[i].currency),
            tvlUsd: Number(apyData.data[i].availableLiquidity),
            apy: apyData.data[i].apy,
        })
    }

    dataPool[0].pool="0x7D00cd74FF385c955EA3d79e47BF06bD7386387D"
    dataPool[1].pool="0x918146359264C492BD6934071c6Bd31C854EDBc3"
    dataPool[2].pool="0xE273Ad7ee11dCfAA87383aD5977EE1504aC07568"
    dataPool[3].pool="0x9802d866fdE4563d088a6619F7CeF82C0B991A55"
    dataPool[4].pool="0x3A5024E3AAB31A1d3184127B52b0e4B4E9ADcC34"

    return dataPool;
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
};