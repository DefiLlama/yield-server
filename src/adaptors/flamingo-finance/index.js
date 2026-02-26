const utils = require('../utils');

const NEO_COINGECKO = {
  '0xf0151f528127558851b39c2cd8aa47da7418ab28': 'coingecko:flamingo-finance',
  '0x48c40d4666f93408be1bef038b6722404d9a4c2a': 'coingecko:neo',
  '0xd6abe115ecb75e1fa0b42f5e85934ce8c1ae2893': 'coingecko:wrapped-bitcoin',
  '0xcd48b160c1bbc9d74997b803b9a7ad50a4bef020': 'coingecko:tether',
  '0x1005d400bcc2a56b7352f09e273be3f9933a5fb1': 'coingecko:tether',
  '0xc14b601252aa5dfa6166cf35fe5ccd2e35f3fdf5': 'coingecko:ethereum',
  '0x6627a4a0dfcb409bf1e0fb3e217441f3f9809fce': 'coingecko:usd-coin',
  '0x00fb9575f220727f71a1537f75e83af9387628ff': 'coingecko:binancecoin',
  '0x78e1330db47634afdb5ea455302ba2d12b8d549f': 'coingecko:switcheo',
  '0xd3a41b53888a733b549f5d4146e7a98d3285fa21': 'coingecko:ethereum',
  '0xd2a4cff31913016155e38e474a2c06d08be276cf': 'coingecko:gas',
  '0x68b938cc42b6a2d54fb9040f5facf4290ebb8c5f': 'coingecko:tether',
};
const resolveNeoToken = (addr) => NEO_COINGECKO[addr] || addr;

const poolsFunction = async () => {
  const poolsData = await utils.getData(
    'https://flamingo-us-1.b-cdn.net/flamingo/analytics/flamingo/defillama-yields'
  );

  const pools = Array.isArray(poolsData) ? poolsData : poolsData.pools;

  return pools.reduce((acc, p) => {
    if (!acc.some((pool) => pool.pool === p.pool)) {
      acc.push({
        pool: p.pool,
        chain: 'Neo',
        project: 'flamingo-finance',
        symbol: p.symbol,
        tvlUsd: p.tvlUsd,
        apyBase: p.apyBase || 0,
        apyReward: p.apyReward || 0,
        rewardTokens: p.rewardTokens
          ? Array.isArray(p.rewardTokens)
            ? p.rewardTokens
            : [p.rewardTokens]
          : [],
        underlyingTokens: (p.underlyingTokens || []).map(resolveNeoToken),
        poolMeta: p.poolMeta || null,
      });
    }
    return acc;
  }, []);
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://flamingo.finance/earn/overview',
};