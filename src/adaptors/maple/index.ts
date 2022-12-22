const axios = require('axios');

const utils = require('../utils');

const API_URL = 'https://api.maple.finance/v2/graphql';

const query = {
  operationName: 'getLendData',
  variables: {},
  query:
    'query getLendData {\n  poolV2S(where: {activated: true}) {\n    ...PoolV2Overview\n    __typename\n  }\n  maple(id: "1") {\n    ...MapleOverview\n    __typename\n  }\n}\n\nfragment PoolV2Overview on PoolV2 {\n  assets\n apyData {\n    id\n    monthlyApyAfterFees\n    __typename\n  }\n  asset {\n    decimals\n    id\n    price\n    symbol\n    __typename\n  }\n  delegateManagementFeeRate\n  id\n  name\n  openToPublic\n  poolMeta {\n    ...PoolMetaV2\n    __typename\n  }\n  platformManagementFeeRate\n  principalOut\n  totalLoanOriginations\n  __typename\n}\n\nfragment PoolMetaV2 on PoolMetadata {\n  overview\n  poolDelegate {\n    aboutBusiness\n    totalAssetsUnderManagement\n    companyName\n    companySize\n    deckFileUrl\n    deckFileName\n    linkedIn\n    name\n    profileUrl\n    twitter\n    videoUrl\n    website\n    __typename\n  }\n  poolName\n  reportFileName\n  reportFileUrl\n  strategy\n  underwritingBullets\n  __typename\n}\n\nfragment MapleOverview on Maple {\n  id\n  totalActiveLoans\n  totalInterestEarned\n  totalInterestEarnedV2\n  totalLoanOriginations\n  __typename\n}',
};

const apy = async () => {
  const pools = (await axios.post(API_URL, query)).data.data.poolV2S;

  return pools
    .map((pool) => {
      // exclude permissioned pools
      if (!pool.openToPublic) return {};

      const tokenPrice = pool.asset.price / 1e8;

      return {
        pool: pool.apyData.id,
        chain: utils.formatChain('ethereum'),
        project: 'maple',
        symbol: pool.asset.symbol,
        poolMeta: pool.name,
        tvlUsd: (Number(pool.assets) * tokenPrice) / 10 ** pool.asset.decimals,
        apyBase: Number(pool.apyData.monthlyApyAfterFees) / 1e28,
        underlyingTokens: [pool.asset.id],
        // borrow fields
        ltv: 0, // permissioned
      };
    })
    .filter((p) => p.pool);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.maple.finance/#/earn',
};
