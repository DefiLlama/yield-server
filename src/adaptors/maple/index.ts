const axios = require('axios');
const utils = require('../utils');
const { default: BigNumber } = require('bignumber.js');

const API_URL = 'https://api.maple.finance/v2/graphql';

// Query for Syrup pools only
const query = {
  operationName: 'getLendData',
  variables: {},
  query: `
    query getLendData {
      poolV2S(where: {syrupRouter_not: null}) {
        id
        name
        assets
        strategiesDeployed
        principalOut
        collateralValue
        weeklyApy
        asset {
          id
          symbol
          decimals
          price
        }
      }
      syrupGlobals {
        dripsYieldBoost
      }
    }
  `,
};

const apy = async () => {
  try {
    const response = await axios.post(API_URL, query);
    const pools = response.data.data.poolV2S;
    const syrupGlobals = response.data.data.syrupGlobals;
    const rewardAPY = syrupGlobals?.dripsYieldBoost || 0;

    return pools
      .map((pool) => {
        const assetDecimals = pool.asset.decimals;
        const tokenPrice = new BigNumber(pool.asset.price).dividedBy(new BigNumber(10).pow(assetDecimals));

        const totalAssets = new BigNumber(pool.assets || 0)
          .plus(pool.strategiesDeployed || 0)
          .plus(pool.principalOut || 0)
          .plus(pool.collateralValue || 0);

        const tvlUsd = totalAssets
          .multipliedBy(tokenPrice)
          .dividedBy(new BigNumber(10).pow(assetDecimals))
          .toNumber();

        const apyBase = new BigNumber(pool.weeklyApy).dividedBy(new BigNumber(10).pow(28)).toNumber();
        const apyReward = new BigNumber(rewardAPY).dividedBy(new BigNumber(10).pow(4)).toNumber();
        return {
          pool: pool.id,
          chain: utils.formatChain('ethereum'),
          project: 'maple',
          symbol: pool.asset.symbol,
          poolMeta: pool.name,
          tvlUsd: tvlUsd,
          apyBase: apyBase,
          apyReward: apyReward,
          underlyingTokens: [pool.asset.id],
          rewardTokens: apyReward > 0 ? ['0x643C4E15d7d62Ad0aBeC4a9BD4b001aA3Ef52d66'] : [],
          // borrow fields
          ltv: 0, // permissioned
          url: `https://app.maple.finance/pool/${pool.id}`,
        };
      })
      .filter((p) => p !== null && p.tvlUsd > 0);
  } catch (error) {
    console.error('Error fetching Maple Finance data:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.maple.finance/#/earn',
};
