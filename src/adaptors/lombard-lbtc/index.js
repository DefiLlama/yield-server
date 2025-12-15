const axios = require('axios');

const token = '0x8236a87084f8B84306f72007F36F2618A5634494';

const apy = async () => {
  const [{ data: apy }, { data: tvl }, { data: price }] = await Promise.all([
    axios.get(
      'https://mainnet.prod.lombard.finance/api/v1/analytics/estimated-apy?partner_id='
    ),
    axios.get(
      'https://ledger-mainnet.lombard-fi.com:1317/lombard-finance/ledger/btcstaking/staking_vault_base_balance'
    ),
    axios.get(`https://coins.llama.fi/prices/current/ethereum:${token}`),
  ]);

  return [
    {
      pool: token,
      project: 'lombard-lbtc',
      chain: 'bitcoin',
      symbol: 'lBTC',
      tvl:
        (Number(tvl.balance) / 1e8) * price.coins[`ethereum:${token}`]?.price,
      apy: apy.lbtc_estimated_apy * 100,
    },
  ];
};

module.exports = {
  apy,
  url: 'https://www.lombard.finance/app/stake/',
};
