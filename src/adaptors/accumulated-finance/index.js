const utils = require('../../../../yield-server/src/adaptors/utils');

const chainMap = {
  96: 'Bitkub',
  7000: 'Zeta',
  2632500: 'Coti',
  106: 'Velas'
};

const main = async () => {
  const data = await utils.getData('https://api.accumulated.finance/v1/lending');

  return data.result
    .filter((p) => !p.soon && !p.hidden && !p.sunset)
    .map((pool) => {
      const chain = chainMap[pool.chainId];
      if (!chain) return null;
      
      const price = pool.assetTokenDetails.price;
      const decimals = pool.assetTokenDetails.decimals;
      
      // availableAssets is in wei/raw units
      const available = pool.availableAssets / (10 ** decimals);
      const tvlUsd = available * price;

      // lendingRate and borrowingRate are in basis points * 100? 
      // API: 27 -> 0.27%. 
      // Adaptor Schema: apyBase is in %. So 0.27.
      // So divide API value by 100.
      
      return {
        pool: pool.address,
        chain,
        project: 'accumulated-finance',
        symbol: pool.assetTokenDetails.symbol,
        tvlUsd: tvlUsd,
        apyBase: pool.lendingRate / 100,
        apyBaseBorrow: pool.borrowingRate / 100,
        totalSupplyUsd: pool.assetTVL,
        totalBorrowUsd: pool.assetTVL - tvlUsd,
        ltv: pool.ltv / 10000,
        url: `https://accumulated.finance/lend/${pool.chainId}/${pool.address}`,
        underlyingTokens: [pool.collateralToken],
      };
    })
    // .filter(pool => pool && pool.tvlUsd >= 10000)
    .filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://accumulated.finance/lend',
};
