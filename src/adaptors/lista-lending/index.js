const axios = require('axios');

const API_URL = 'https://api.lista.org/api/moolah/vault/list';
const CHAINS = ['bsc', 'ethereum'];
const LISTA_TOKEN = '0xFceB31A79F71AC9CBDCF853519c1b12D379EdC46';
const LISTA_REWARD_TOKEN = {
  bsc: LISTA_TOKEN,
  ethereum: 'coingecko:lista',
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
      const rewardToken = LISTA_REWARD_TOKEN[chain];

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
          vault.emissionEnabled && emissionApy > 0 && rewardToken
            ? [rewardToken]
            : [], // LISTA
      };
    });

    pools = [...pools, ...earnPools];
  }

  return pools;
};

module.exports = {
  protocolId: '6056',
  apy,
};
