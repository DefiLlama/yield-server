const axios = require('axios');

const API_URL = 'https://api.lista.org/api/moolah/vault/list';
const CHAINS = ['bsc', 'ethereum'];
const LISTA_REWARD_TOKEN = {
  bsc: '0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46',
};

const apy = async () => {
  let pools = [];

  for (const chain of CHAINS) {
    const { data } = await axios.get(API_URL, {
      params: {
        page: 1,
        pageSize: 100,
        chain,
      },
    });

    const earnPools = data.data.list.map((vault) => {
      const baseApy = parseFloat(vault.apy);
      const emissionApy = parseFloat(vault.emissionApy);

      return {
        pool: `lista-lending-${vault.address}-${chain}`,
        chain,
        project: 'lista-lending',
        symbol: vault.assetSymbol,
        apyBase: baseApy * 100,
        tvlUsd: parseFloat(vault.depositsUsd),
        underlyingTokens: [vault.asset],
        url: `https://lista.org/lending/vault/${chain}/${vault.address}?tab=vault`,
        apyReward: emissionApy * 100,
        rewardTokens:
          vault.emissionEnabled && LISTA_REWARD_TOKEN[chain]
            ? [LISTA_REWARD_TOKEN[chain]]
            : [], // LISTA
      };
    });

    pools = [...pools, ...earnPools];
  }

  return pools;
};

module.exports = {
  apy,
};
