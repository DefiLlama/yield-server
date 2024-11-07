const utils = require('../utils');

const vaultApys = async () => {
  const vaults = await utils.getData(
    'https://api.quasar.fi/vaults'
  );

  // Vaults list that we will use on the return array
  const mellowVault = vaults.find((vault) => vault.name === 'Unified Restaked LST' && vault.provider === 'mellow');

  return [
    // Mellow Vault
    {
        pool: mellowVault.address,
        chain: utils.formatChain(mellowVault.network),
        project: 'quasar',
        symbol: mellowVault.strategyAssets[0].symbol, // wstETH
        tvlUsd: Number(mellowVault.tvl.usd),
        apy: mellowVault.apy,
    },
    // ... implement here other vaults
  ];
};

module.exports = {
  timetravel: false,
  apy: vaultApys,
  url: 'https://app.quasar.fi',
};
