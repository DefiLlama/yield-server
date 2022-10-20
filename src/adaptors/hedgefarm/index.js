const utils = require('../utils');
const sdk = require('@defillama/sdk');

const ALPHA1_CONTRACT = '0xdE4133f0CFA1a61Ba94EC64b6fEde4acC1fE929E';

const abi = {
    inputs: [],
    name: "totalBalance",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function"
};

async function tvl() {
    const totalBalance = (await sdk.api.abi.call({
        abi: abi,
        chain: 'avax',
        target: ALPHA1_CONTRACT,
        params: [],
    })).output;

    return totalBalance;
}

const poolsFunction = async () => {
    const apyData = await utils.getData(
        'https://api.hedgefarm.workers.dev/alpha1/performance'
    );

    const balance = await tvl();

    const alpha1 = {
        pool: '0xdE4133f0CFA1a61Ba94EC64b6fEde4acC1fE929E',
        chain: utils.formatChain('avalanche'),
        project: 'hedgefarm',
        symbol: utils.formatSymbol('USDC'),
        tvlUsd: balance / 1e6,
        apy: apyData.averageApy * 100,
    };

    return [alpha1];
}

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://hedgefarm.finance',
};