
const utils = require('../utils');

const poolsFunction = async () => {

    const networks = {
        1: 'Ethereum',
        137: 'Polygon',
    };
    const underlyingTokens = {
        1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
        137: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    };

    const dataTvl = await utils.getData(
        'https://clearpool.finance/api/kpi'
    );
    const dataPools = await utils.getData(
        'https://clearpool.finance/api/top-pools'
    );

    let pools = [];
    const allpools = Object.keys(dataPools).map((chainId) => {
        dataPools[chainId].map((pool) => {
            const chainName = utils.formatChain(networks[chainId]);
            pools.push({
                pool: `${pool.address}-${chainName}`.toLowerCase(),
                chain: chainName, // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
                project: 'clearpool',
                symbol: pool.symbol,
                tvlUsd: dataTvl.tvl, // number representing current USD TVL in pool
                apyBase: 0, // APY from pool fees/supplying in %
                apyReward: pool.apr, // APY from pool LM rewards in %
                rewardTokens: ['0x66761fa41377003622aee3c7675fc7b5c1c2fac5'], // CPOOL token address // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
                underlyingTokens: [underlyingTokens[chainId]], // Array of underlying token addresses from a pool, eg here USDC address on ethereum
                poolMeta: "V2 market", // A string value which can stand for any specific details of a pool position, market, fee tier, lock duration, specific strategy etc
            });
        });
    });

    return [pools[0]]; // single pool
    // return pools; //for all ethereum pools
};
module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://clearpool.finance/',
};