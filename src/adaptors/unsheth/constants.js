
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

const BINANCE_RPC_URL = "https://bsc-dataseed.binance.org/"; //TODO Change

module.exports = {   
    BINANCE_RPC_URL,
    tokensToCheck,
    seconds_per_year,
    coingeckoIds,
    denomination
}

