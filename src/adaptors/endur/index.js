const utils = require('../utils')
const STRK = "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"

const STARKNET_COINGECKO = {
  WBTC: 'coingecko:wrapped-bitcoin',
  tBTC: 'coingecko:tbtc',
  LBTC: 'coingecko:lombard-staked-btc',
  SolvBTC: 'coingecko:solv-btc',
  ETH: 'coingecko:ethereum',
  STRK: 'coingecko:starknet',
  USDC: 'coingecko:usd-coin',
  USDT: 'coingecko:tether',
};

const apy = async () => {
    const apyData = await utils.getData(
        'https://staging.endur.fi/api/lst/stats'
    );
    return apyData
    .filter(lst => parseFloat(lst.tvlUsd) > 10000)
    .map((lst) => {
        const currTvlUsd = parseFloat(lst.tvlUsd);
        const currPool = lst.asset;
        const baseApy = (lst.apy || 0) * 100;
        const underlyingToken = lst.assetAddress;

        return {
            pool: `endur-${currPool}`, 
            chain: 'Starknet',
            project: 'endur',
            symbol: currPool,
            underlyingTokens: [STARKNET_COINGECKO[currPool] || underlyingToken],
            tvlUsd: currTvlUsd,
            apyBase: baseApy,
            url: `https://app.endur.fi/`,
            poolMeta: currPool,
        }
    })
};

module.exports = {
    timetravel: false,
    apy: apy,
    url : 'https://app.endur.fi'
};