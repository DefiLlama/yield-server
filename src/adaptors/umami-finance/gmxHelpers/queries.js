const { sub } = require('date-fns');

const marketFeesQuery = (marketAddress) => {
  return `
    _${marketAddress}_lte_start_of_period_: collectedMarketFeesInfos(
        orderBy: timestampGroup_DESC,
        where: {
          marketAddress_containsInsensitive: "${marketAddress}",
          period_eq: "1h",
          timestampGroup_lte: ${Math.floor(
            sub(new Date(), { days: 7 }).valueOf() / 1000
          )}
        },
        limit: 1
      ) {
        cumulativeFeeUsdPerPoolValue
        cumulativeBorrowingFeeUsdPerPoolValue
      }

    _${marketAddress}_recent: collectedMarketFeesInfos(
      orderBy: timestampGroup_DESC,
      where: {
        marketAddress_containsInsensitive: "${marketAddress}",
        period_eq: "1h"
      },
      limit: 1
    ) {
      cumulativeFeeUsdPerPoolValue
      cumulativeBorrowingFeeUsdPerPoolValue
    }

    _${marketAddress}_poolValue: poolValues(where: { marketAddress_containsInsensitive: "${marketAddress}" }) {
      poolValue
    } 
  `;
};

module.exports = {
  marketFeesQuery,
};
