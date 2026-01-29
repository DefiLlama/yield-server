const utils = require('../../../../yield-server/src/adaptors/utils');

const chainMap = {
  96: 'Bitkub',
  7000: 'ZetaChain',
  2632500: 'Coti',
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
      const availableUsd = available * price;
      const totalCollateralUsd = pool.collateralTVL;
      const tvlUsd = availableUsd + totalCollateralUsd;

      return {
        pool: pool.address,
        chain,
        project: 'accumulated-finance-lending',
        symbol: pool.assetTokenDetails.symbol,
        tvlUsd: tvlUsd,
        apyBase: pool.lendingRate / 100,
        apyBaseBorrow: pool.borrowingRate / 100,
        totalSupplyUsd: pool.assetTVL,
        totalBorrowUsd: pool.assetTVL - availableUsd,
        ltv: pool.ltv / 10000,
        url: `https://accumulated.finance/lend/${pool.chainId}/${pool.address}`,
        underlyingTokens: [pool.collateralToken],
      };
    })
    .filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://accumulated.finance/lend',
};
