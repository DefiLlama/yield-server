const sdk = require('@defillama/sdk');
try {
    require('dotenv').config({ path: './config.env' });
} catch (e) {}

const seconds_per_year = 60 * 60 * 24 * 365.25;
const denomination = 1e18;
const coingeckoIds = {
    sfrxETH: 'staked-frax-ether',
    rETH: 'rocket-pool-eth',
    wstETH: 'staked-ether',
    cbETH: 'coinbase-wrapped-staked-eth',
};


const tokensToCheck = [
"sfrxETH",
"rETH",
"wstETH",
"cbETH"
];

const ETHEREUM_RPC_URL = process.env.ALCHEMY_CONNECTION_ETHEREUM;
const BINANCE_RPC_URL = "https://bsc-dataseed.binance.org/";
const sushiSwapSubgraphUrl = sdk.graph.modifyEndpoint('6NUtT5mGjZ1tSshKLf5Q3uEEJtjBZJo1TpL5MXsUBqrT');
const pancakeSwapSubgraphUrl = "https://data-platform.nodereal.io/graph/v1/a1db26ba19064757ac7f991b9383402d/projects/pancakeswap";
const BLOCK_TIME_SECONDS = 12; // Approximate block time in seconds
const BNB_BLOCK_TIME_SECONDS = 3;
const feeRate = 0.003; // Sushi Swap Pool Fee

module.exports = {
    ETHEREUM_RPC_URL,
    BNB_BLOCK_TIME_SECONDS,
    pancakeSwapSubgraphUrl,
    sushiSwapSubgraphUrl,
    BLOCK_TIME_SECONDS,
    feeRate,
    BINANCE_RPC_URL,
    tokensToCheck,
    seconds_per_year,
    coingeckoIds,
    denomination
}

