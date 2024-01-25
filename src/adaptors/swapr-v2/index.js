const utils = require('../utils');
const { request } = require('graphql-request');

const {
  queries: {
    QUERY_PAIRS,
    QUERY_LIQUIDITY_MINING_CAMPAIGNS,
    QUERY_KPI_TOKENS,
    QUERY_TOKEN,
    QUERY_NATIVE_CURRENCY_USD,
  },
} = require('./api');
const {
  constants: {
    PROJECT_NAME,
    XDAI_CHAIN,
    ARBITRUM_CHAIN,
    XDAI_ENDPOINT,
    ARBITRUM_ENDPOINT,
    KPI_ENDPOINT,
  },
} = require('./constants');

const rewardsAPR = {};

const createPool = (pair, chainString) => {
  const { id, token0, token1, totalValueLockedUSD: tvlUsd } = pair;

  const symbol = utils.formatSymbol(`${token0.symbol}-${token1.symbol}`);

  const apyReward = rewardsAPR[id.toLowerCase()];

  let chain = utils.formatChain(chainString);

  if (chain === 'Xdai') chain = 'xDai';

  return {
    pool: id,
    chain,
    project: PROJECT_NAME,
    symbol,
    tvlUsd,
    apyReward,
    rewardTokens: ['0x6cacdb97e3fc8136805a9e7c342d866ab77d0957'],
  };
};

const calculateRewardsApy = async (
  endpoint,
  pair,
  liquidityMiningCampaigns,
  kpiTokens,
  nativeCurrencyPrice
) => {
  const normalizedPairId = pair.id.toLowerCase();

  // filter by id and active
  const activeCampaigns = liquidityMiningCampaigns.filter(
    (campaign) =>
      campaign.stakablePair.id.toLowerCase() === normalizedPairId &&
      campaign.endsAt * 1000 >= Date.now()
  );

  if (!activeCampaigns.length) {
    rewardsAPR[normalizedPairId] = 0;
    return;
  }

  for (const campaign of activeCampaigns) {
    // duration in days
    const duration = campaign.duration / 24 / 3600;

    let totalValueUSD = 0;

    for (const reward of campaign.rewards) {
      const { token, amount } = reward;

      const kpiToken = kpiTokens?.find(
        ({ id }) => id.toLowerCase() === token.id.toLowerCase()
      );

      let tokenAddress;

      if (kpiToken) {
        tokenAddress = kpiToken.collateral.token.id;
      } else {
        tokenAddress = token.id;
      }

      const {
        token: { derivedNativeCurrency },
      } = await request(
        endpoint,
        QUERY_TOKEN.replace('<PLACEHOLDER>', `"${tokenAddress.toLowerCase()}"`)
      );

      const tokenPrice = derivedNativeCurrency * nativeCurrencyPrice;

      totalValueUSD += tokenPrice * amount;
    }

    const [token0, token1] = await Promise.all([
      request(
        endpoint,
        QUERY_TOKEN.replace(
          '<PLACEHOLDER>',
          `"${pair.token0.id.toLowerCase()}"`
        )
      ),
      request(
        endpoint,
        QUERY_TOKEN.replace(
          '<PLACEHOLDER>',
          `"${pair.token1.id.toLowerCase()}"`
        )
      ),
    ]);

    const token0Price =
      token0.token.derivedNativeCurrency * nativeCurrencyPrice;
    const token1Price =
      token1.token.derivedNativeCurrency * nativeCurrencyPrice;

    const lpTokenPrice =
      (2 *
        (Math.sqrt(pair.reserve0 * pair.reserve1) *
          Math.sqrt(token0Price * token1Price))) /
      pair.totalSupply;

    const tvlCampaign = campaign.stakedAmount * lpTokenPrice;

    const apr = ((totalValueUSD / duration) * 365 * 100) / tvlCampaign;

    if (rewardsAPR[normalizedPairId]) {
      rewardsAPR[normalizedPairId] += apr;
    } else {
      rewardsAPR[normalizedPairId] = apr;
    }
  }
};

const topLvl = async (chainString, endpoint, timestamp) => {
  const [block] = await utils.getBlocks(chainString, timestamp, [endpoint]);

  const { liquidityMiningCampaigns } = await request(
    endpoint,
    QUERY_LIQUIDITY_MINING_CAMPAIGNS
  );

  let pairs = await request(
    endpoint,
    QUERY_PAIRS.replace('<PLACEHOLDER>', block)
  );

  const {
    bundle: { nativeCurrencyPrice },
  } = await request(endpoint, QUERY_NATIVE_CURRENCY_USD);

  //currently carrot is only on xdai chain
  let kpiTokens;

  if (chainString === XDAI_CHAIN) {
    const response = await request(KPI_ENDPOINT, QUERY_KPI_TOKENS);
    kpiTokens = response.kpiTokens;
  }

  pairs = await utils.tvl(pairs.pairs, chainString);

  for (const pair of pairs) {
    await calculateRewardsApy(
      endpoint,
      pair,
      liquidityMiningCampaigns,
      kpiTokens,
      nativeCurrencyPrice
    );
  }

  return pairs.map((pair) => createPool(pair, chainString));
};

const main = async (timestamp = null) => {
  const data = await Promise.all([
    topLvl(XDAI_CHAIN, XDAI_ENDPOINT, timestamp),
    topLvl(ARBITRUM_CHAIN, ARBITRUM_ENDPOINT, timestamp),
  ]);

  return data
    .flat()
    .filter((pool) => isFinite(pool.apyReward) && !isNaN(pool.apyReward));
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://swapr.eth.link/#/pools?chainId=1',
};
