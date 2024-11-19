const axios = require('axios');
const utils = require('../utils');

const apy = async () => {
  const vaults = await utils.getData(
    'https://api.quasar.fi/vaults'
  );

  // Vaults list that we will use on the return array
  const mellowVault = vaults.find((vault) => vault.name === 'Unified Restaked LST' && vault.provider === 'mellow');
  const underlyingToken = `${mellowVault.network}:${mellowVault.strategyAssets[0].denom}`

  return [
    // Mellow Vault
    {
        poolMeta: "Mellow Finance Protocol. Lockup Period: Withdrawals are processed by risk curators within 1-7 days in batches.",
        pool: mellowVault.address,
        chain: utils.formatChain(mellowVault.network),
        project: 'quasar-vaults',
        symbol: "urLRT",
        tvlUsd: (await axios.get(`https://coins.llama.fi/prices/current/${underlyingToken}`)).data.coins[`${underlyingToken}`]?.price * mellowVault.totalSupply,
        apy: mellowVault.apy,
    }
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.quasar.fi',
};
