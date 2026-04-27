const utils = require('../utils');

const CHAIN_MAPPING = {
  1329: 'Sei',
};

const TOKEN_ADDRESSES = {
  1329: {
    'wsei': '0xE30feDd158A2e3b13e9badaeABaFc5516e95e8C7',
  },
};

const poolsFunction = async () => {
  const vaultsData = await utils.getData(
    'https://api.mgvinfra.com/registry/whitelist?chainId=1329&version=2'
  );

  const pools = vaultsData.map(vault => {
    const wseiAddress = TOKEN_ADDRESSES[vault.chainId]?.wsei;
    return {
      pool: `${vault.address}-${CHAIN_MAPPING[vault.chainId] || vault.chainId}`.toLowerCase(),
      chain: utils.formatChain(CHAIN_MAPPING[vault.chainId] || 'Sei'),
      project: 'oxium',
      symbol: utils.formatSymbol(`${vault.market.base.symbol}-${vault.market.quote.symbol}`),
      tvlUsd: vault.snapshot.TVL.total || 0,
      apyBase: (vault.snapshot.base?.total || 0) + (vault.snapshot.strategy?.total || 0),
      apyReward: vault.snapshot.rewards?.total || 0,
      rewardTokens: vault.snapshot.rewards?.total > 0 ? [wseiAddress] : undefined,
      underlyingTokens: [vault.market.base.address, vault.market.quote.address],
      poolMeta: `${vault.strategyType} - ${vault.manager}`,
      url: `https://app.oxium.xyz/earn/${vault.address}`
    };
  });

  return pools.filter(pool => pool.tvlUsd >= 10000);
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.oxium.xyz/earn',
};