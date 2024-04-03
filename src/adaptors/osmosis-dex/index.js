const utils = require('../utils');

const uniquePools = new Set();
const getApy = async () => {
  const tvlData = await utils.getData(
    'https://api-osmosis.imperator.co/pools/v2/all?low_liquidity=false'
  );
  const aprData = await utils.getData(
    'https://api-osmosis.imperator.co/apr/v2/all'
  );

  const data = Object.keys(tvlData).map((poolId) => {
    const tvl = tvlData[poolId];
    const x = tvl[0];

    const poolSplit = x.denom.split('/');
    const pool = poolSplit.length > 1 ? poolSplit[1] : poolSplit[0];

    const tvlUsd = x.liquidity;

    const symbol = `${tvl[0]?.symbol}-${tvl[1]?.symbol}`;

    if (symbol.includes(undefined)) return null;

    // base apr
    const feeTier = x.fees.replace('%', '') / 100;
    const fees24h = x.volume_24h * feeTier;
    const fees7d = x.volume_7d * feeTier;
    const aprBase = ((fees24h * 365) / tvlUsd) * 100;
    const aprBase7d = ((fees7d * 52) / tvlUsd) * 100;

    // reward apr
    const aprs = aprData.find((a) => String(a.pool_id) === poolId)?.apr_list;

    const aprReward = aprs?.reduce((acc, reward) => acc + reward.apr_14d, 0);
    const aprSuperfluid = aprs?.reduce(
      (acc, reward) => acc + reward.apr_superfluid,
      0
    );
    const apyReward = aprSuperfluid > 0 ? aprSuperfluid : aprReward;

    return {
      pool: `osmosis-${poolId}`,
      chain: 'Osmosis',
      project: 'osmosis-dex',
      symbol: utils.formatSymbol(symbol),
      poolMeta: `${tvl[0].fees}`,
      tvlUsd: x.liquidity,
      apyBase: aprBase,
      apyBase7d: aprBase7d,
      apyReward,
      rewardTokens: aprs?.map((a) => a?.symbol) ?? [],
      volumeUsd1d: x.volume_24h,
      volumeUsd7d: x.volume_7d,
    };
  });

  return data.filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.osmosis.zone/pools',
};
