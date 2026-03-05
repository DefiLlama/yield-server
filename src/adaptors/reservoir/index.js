const { fetchURL } = require('../../helper/utils');

const API_URL = 'https://api.reservoir.fi/v1/pairs';

const getApy = async () => {
    const { data: pairs } = await fetchURL(API_URL);

    return pairs.map((pair) => {
        const symbols = pair.token0.symbol + '-' + pair.token1.symbol
        const poolType = pair.curveId === 0 ? 'Constant Product' : 'Stable'
        const tvlUSD = pair.token0.usdPrice * Number(pair.token0Reserve) + pair.token1.usdPrice * Number(pair.token1Reserve)
        return {
            pool: pair.address,
            chain: 'Avalanche',
            project: 'reservoir',
            symbol: symbols,
            tvlUsd: tvlUSD,
            apyBase: pair.swapApr,
            apyReward: pair.supplyApr,
            rewardTokens: ['0x2e3b32730B4F6b6502BdAa9122df3B026eDE5391'],
            underlyingTokens: [pair.token0.contractAddress, pair.token1.contractAddress],
            poolMeta: poolType
        }
    })
}

module.exports = {
    timetravel: false,
    apy: getApy,
    url: 'https://app.reservoir.fi/analytics',
};
