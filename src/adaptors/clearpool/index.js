
const utils = require('../utils');

const poolsFunction = async () => {

    const dataTvl = await utils.getData(
        'https://clearpool.finance/api/kpi'
    );
    const dataPools = await utils.getData(
        'https://clearpool.finance/api/top-pools'
    );
    const pools = dataPools[1].map((pool) => {
        return {
            pool: pool.address + "-ethereum", // unique identifier for the pool in the form of: `${ReceivedTokenAddress}-${chain}`.toLowerCase()
            chain: utils.formatChain("Ethereum"), // chain where the pool is (needs to match the `name` field in here https://api.llama.fi/chains)
            project: 'clearpool', // protocol (using the slug again)
            symbol: pool.symbol, // symbol of the tokens in pool, can be a single symbol if pool is single-sided or multiple symbols (eg: USDT-ETH) if it's an LP // "cpAMB-USDC"
            tvlUsd: dataTvl.tvl, // number representing current USD TVL in pool
            apyBase: 0, // APY from pool fees/supplying in %
            apyReward: pool.apr, // APY from pool LM rewards in %
            rewardTokens: ['0x66761fa41377003622aee3c7675fc7b5c1c2fac5'], // CPOOL token address // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
            underlyingTokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'], // Array of underlying token addresses from a pool, eg here USDC address on ethereum
            poolMeta: "V2 market", // A string value which can stand for any specific details of a pool position, market, fee tier, lock duration, specific strategy etc
        };
    });
    return [pools[0]]; // single pool
    // return pools; //for all ethereum pools
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://clearpool.finance/',
};