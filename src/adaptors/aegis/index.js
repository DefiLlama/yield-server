const superagent = require('superagent');

const apy = async () => {
  const aegisFetch = await superagent
  .get('https://api.aegis.im/api/project-stats')
  .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')

  const aegisData = aegisFetch.body.data;

  const yusdPools = [
    {
      pool: '0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a-ethereum'.toLowerCase(),
      chain: 'Ethereum',
      project: 'aegis',
      symbol: 'YUSD',
      tvlUsd: aegisData.yusd_tvl,
      apy: aegisData.efficient_apr,
    },
    {
    pool: '0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f-binance'.toLowerCase(),
    chain: 'Binance',
    project: 'aegis',
    symbol: 'YUSD',
    tvlUsd: aegisData.yusd_tvl,
    apy: aegisData.efficient_apr,
  }];

  return yusdPools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.aegis.im/',
};
