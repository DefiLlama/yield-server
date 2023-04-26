const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');

const LP = '0x03229fb11e3D7E8Aca8C758DBD0EA737950d6CD0';
const LION = '0x8ebb85d53e6955e557b7c53acde1d42fd68561ec';
const WETH = '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1';

const vault = "0x8eF99304eb88Af9BDe85d58a35339Cb0e2a557B6";
const pool = "0x154E2b1dBE9F493fF7938E5d686366138ddCE017";
const dashboard = "0x951125E1d000Be7e3cc3f51Db5603d56D89CC841";


async function lpPrice() { 
    return (await sdk.api.abi.call({ target: vault, abi: abi['getLPPrice'], chain: 'arbitrum' })).output; 
}

async function lionPrice() { 
    return (await sdk.api.abi.call({ target: dashboard, abi: abi['getLionPrice'], chain: 'arbitrum' })).output; 
}

async function ethPrice() { 
    return (await sdk.api.abi.call({ target: vault, params: [WETH], abi: abi['getPrice'], chain: 'arbitrum' })).output; 
}

async function tokenBalance(token) {
    return (await sdk.api.abi.call({ target: token, params: [pool], abi: 'erc20:balanceOf', chain: 'arbitrum'})).output; 
}

async function getAPY(pid, lpPrice, lionPrice, ethPrice) {
    return await sdk.api.abi.call(
        { 
            target: pool, 
            abi: abi['getUserApr'], 
            chain: 'arbitrum', 
            params: [pid, lpPrice, lionPrice, ethPrice, "0x0000000000000000000000000000000000000000"]
        });
}


const getPools = async () => {
    const _lpPrice = Math.round((await lpPrice())/1e12);
    const _lionPrice = await lionPrice();
    const _ethPrice = Math.round((await ethPrice())/1e24);

    const apy0 = (await getAPY(0, _lpPrice, _lionPrice, _ethPrice)).output;
    const apy1 = (await getAPY(1, _lpPrice, _lionPrice, _ethPrice)).output;

    let pools = [];
    pools.push(
        {
            pool: pool + "-0",
            chain: 'arbitrum',
            project: 'liondex',
            symbol: 'LION',
            tvlUsd: (await tokenBalance(LION)) * _lionPrice / 1e18 / 1e6,
            apyBase: (Number(apy0[0]) + Number(apy0[1]) + Number(apy0[2]))/1e6
        },
        {
            pool: pool + "-1",
            chain: 'arbitrum',
            project: 'liondex',
            symbol: 'LP',
            tvlUsd: (await tokenBalance(LP)) * _lpPrice / 1e18 / 1e6,
            apyBase: (Number(apy1[0]) + Number(apy1[1]) + Number(apy1[2]))/1e18
        }
    );

    return pools;
};

module.exports = {
    timetravel: false,
    apy: getPools,
    url: 'https://app.liondex.com/earn',
};