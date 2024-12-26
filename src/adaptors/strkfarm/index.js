const utils = require('../utils');

const apy = async () => {
  const apyData = await utils.getData(
    'https://app.strkfarm.xyz/api/strategies'
  );
  const tokenAddressToSymbolMap = {
    "0x4718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d": "STRK",
    "0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8": "USDC",
    "0x049d36570d4e46f48e99674bd3fcc84644ddd6b96f7c741b1562b82f9e004dc7": "ETH"
  };
  return apyData.strategies
  .filter(strategy => parseFloat(strategy.tvlUsd) >= 10000)
  .map((strategy, index) => {
    const currTvlUsd = `${strategy.tvlUsd}` 
    const currPool = `${strategy.name}`
    const currTokenAddress = `${strategy.depositToken[0]}`
    const currUnderlyingTokens = `${strategy.depositToken[0]}`
    const currApy = `${(strategy.apy) * 100}`
    const currPoolId = `${strategy.id}`
    return {
        pool: currPoolId,
        chain: 'Starknet',
        project: 'strkfarm',
        symbol: tokenAddressToSymbolMap[currTokenAddress],
        underlyingTokens: [currUnderlyingTokens],
        tvlUsd: parseFloat(currTvlUsd),
        apy: parseFloat(currApy),
        url: `https://app.strkfarm.xyz/strategy/${currPoolId}`,
        poolMeta: currPool,
    };
  })
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.strkfarm.xyz/?tab=strategies',
};