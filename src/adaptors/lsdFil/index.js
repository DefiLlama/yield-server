const sdk = require('@defillama/sdk3');
const axios = require('axios');
const abiStakingPool = require('./abiStakingPool');

const stakingPool = '0x0985F36e4eB47fAFc074154eaBA59888cCf0B8fD';
const variableDebtTokenAddress = '0xc18c87c4b0aDAFFC4efbd0d8f418BD8F55dB1247';
const sdkChain = 'filecoin';
const url = 'https://dapp.themis.capital/';


const getApy = async () => {

    const priceKey = `coingecko:filecoin`;
    const price = (
        await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
    ).data.coins[priceKey]?.price;

    const reserveData = (await sdk.api.abi.call({
        target: stakingPool,
        abi: abiStakingPool.find((m) => m.name === 'getReserveData'),
        chain: sdkChain,
    })).output;
    const apyBase = reserveData.currentLiquidityRate / 1e25;
    const apyBaseBorrow = reserveData.currentVariableBorrowRate / 1e25;

    const totalBorrow = (
        await sdk.api.abi.call({
            target: variableDebtTokenAddress,
            abi: 'erc20:totalSupply',
            chain: sdkChain,
        })
    ).output;

    const decimal = (
        await sdk.api.abi.call({
            target: variableDebtTokenAddress,
            abi: 'erc20:decimals',
            chain: sdkChain,
        })
    ).output;

    const tvlUsd =
        (await sdk.api.eth.getBalance({target: stakingPool, decimals: 18, chain: sdkChain})).output * price;
    const totalBorrowUsd = (totalBorrow / 10 ** decimal) * price;
    const totalSupplyUsd = tvlUsd + totalBorrowUsd;

    return [{
        pool: `${stakingPool}-${sdkChain}`.toLowerCase(),
        symbol: 'lsdFIL',
        project: 'lsdfil',
        chain: sdkChain,
        tvlUsd,
        apyBase,
        url,
        // borrow fields
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow,
    }];
}

module.exports = {
    apy: getApy,
};



