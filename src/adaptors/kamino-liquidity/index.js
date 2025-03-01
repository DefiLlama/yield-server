const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
  const responses = await Promise.allSettled(
    [
      'https://api.kamino.finance/strategies/metrics?env=mainnet-beta&status=LIVE',
      'https://api.kamino.finance/strategies/metrics?env=mainnet-beta&status=IGNORED',
      'https://api.kamino.finance/v2/strategies/volume?env=mainnet-beta',
    ].map((i) => axios.get(i))
  );

  const strategies =
    responses[0].status === 'fulfilled' && responses[1].status === 'fulfilled'
      ? [...responses[0].value.data, ...responses[1].value.data]
      : [];

  const volume =
    responses[2].status === 'fulfilled' ? responses[2].value.data : [];

  const apy = strategies.map((p) => {
    const strategyVolume = volume.find((x) => x.strategy === p.strategy);
    return {
      pool: p.strategy,
      chain: 'Solana',
      project: 'kamino-liquidity',
      symbol: utils.formatSymbol(`${p.tokenA}-${p.tokenB}`),
      underlyingTokens: [p.tokenAMint, p.tokenBMint],
      rewardTokens: p.krewardMints,
      tvlUsd: Number(p.totalValueLocked),
      url: `https://app.kamino.finance/liquidity/${p.strategy}`,
      apyBase: Number(p.kaminoApy.vault.apy24h) * 100,
      apyBase7d: Number(p.kaminoApy.vault.apy7d) * 100,
      apyReward:
        p.kaminoApy.kamino.reduce(
          (partialSum, x) => partialSum + Number(x.apy),
          0
        ) * 100,
      volumeUsd1d: Number(
        strategyVolume?.kaminoVolume.find((x) => x.period === '24h')?.amount
      ),
      volumeUsd7d: Number(
        strategyVolume?.kaminoVolume.find((x) => x.period === '7d')?.amount
      ),
    };
  });

  return apy;
};

module.exports = {
  apy: getApy,
  url: 'https://app.kamino.finance/',
};
