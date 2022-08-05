const utils = require('../utils');
const superagent = require('superagent');

const buildPool = (tokenAddress, tokenSymbol, acrossApiPoolDataForToken, wethPriceData, decimals) => {
  return {
    pool: tokenAddress,
    chain: utils.formatChain("ethereum"), // All yield on Mainnet
    project: "across",
    symbol: utils.formatSymbol(tokenSymbol),
    tvlUsd: wethPriceData.body.coins[`ethereum:${tokenAddress}`].price * Number(acrossApiPoolDataForToken.totalPoolSize) / (10 ** decimals),
    apyBase: Number(acrossApiPoolDataForToken.estimatedApy) * 100,
    underlyingTokens: [tokenAddress]
};
};

const topLvl = async (token) => {
  let data = await utils.getData(
    `https://across.to/api/pools?token=${token}`
  );
  return data;
};

const main = async () => {
    const [
        weth,
        usdc,
        wbtc,
        dai,
        wethPrice,
        usdcPrice,
        wbtcPrice,
        daiPrice
    ] = await Promise.all([
        topLvl("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2"),
        topLvl("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48"),
        topLvl("0x2260fac5e5542a773aa44fbcfedf7c193bc2c599"),
        topLvl("0x6b175474e89094c44da98b954eedeac495271d0f"),
        superagent.post('https://coins.llama.fi/prices').send({
            coins: ['ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'],
        }),
        superagent.post('https://coins.llama.fi/prices').send({
            coins: ['ethereum:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
        }),
        superagent.post('https://coins.llama.fi/prices').send({
            coins: ['ethereum:0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],
        }),
        superagent.post('https://coins.llama.fi/prices').send({
            coins: ['ethereum:0x6b175474e89094c44da98b954eedeac495271d0f'],
        })
    ])
    
    return [
        buildPool("0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", "WETH", weth, wethPrice, 18),
        buildPool("0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", "USDC", usdc, usdcPrice, 6),
        buildPool("0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", "WBTC", wbtc, wbtcPrice, 8),
        buildPool("0x6b175474e89094c44da98b954eedeac495271d0f", "DAI", dai, daiPrice, 18),
    ]
};

module.exports = {
  timetravel: false,
  apy: main,
};
