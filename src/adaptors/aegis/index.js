const sdk = require('@defillama/sdk');
const superagent = require('superagent');

async function getTvl(token, chain) {
  const tvl = await sdk.api.abi.call({
    target: token,
    abi: 'uint256:totalSupply',
    chain: chain
  });
  return tvl.output / 1e18;
}

const apy = async () => {
  const aegisFetch = await superagent
    .get('https://api.aegis.im/api/project-stats')
    .set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36')

  const aegisData = aegisFetch.body.data;
  const aegisEth = '0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a';
  const aegisBsc = '0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f';

  const aegisEthTvl = await getTvl(aegisEth, 'ethereum');
  const aegisBscTvl = await getTvl(aegisBsc, 'bsc');
  const yusdPools = [
    {
      pool: '0x4274cD7277C7bb0806Bd5FE84b9aDAE466a8DA0a-ethereum'.toLowerCase(),
      chain: 'Ethereum',
      project: 'aegis',
      symbol: 'YUSD',
      tvlUsd: aegisEthTvl,
      apy: aegisData.efficient_apr,
    },
    {
      pool: '0xAB3dBcD9B096C3fF76275038bf58eAC10D22C61f-binance'.toLowerCase(),
      chain: 'Binance',
      project: 'aegis',
      symbol: 'YUSD',
      tvlUsd: aegisBscTvl,
      apy: aegisData.efficient_apr,
    },
  ];

  return yusdPools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.aegis.im/',
};
