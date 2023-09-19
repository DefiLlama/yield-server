const { request, gql } = require('graphql-request');

const apy = async () => {
  const endpoint = 'https://api.liqwiddev.net/graphql'

  const query = gql`query ($page: Int) {
    Page (page: $page) {
      market {
        asset {
          name
        }
        state {
          totalSupply
          supplyApy
          utilization
          borrowApy
          borrowLqDistributionApy
          supplyLqDistributionApy
          maxLoanToValue
        }
        price {
          price
        }
        decimals
      }
    }
  }
  `

  const markets = (await request(endpoint, query)).Page.market;

  const getPool = (tokenName, address) => {
    const market = markets.filter((market) => market.asset.name === tokenName)[0];

    return {
      pool: address, // market batch final
      chain: "Cardano",
      project: "liqwid",
      symbol: market.asset.name,
      tvlUsd: market.state.totalSupply / Math.pow(10, market.decimals) * market.price.price,
      apyBase: Number(market.state.supplyApy) * 100,
      apyReward: Number(market.state.supplyLqDistributionApy) * 100,
      rewardTokens: [tokenName, "LQ"],
      underlyingTokens: [tokenName],
      // lending protocol fields
      apyBaseBorrow: Number(market.state.borrowApy) * 100,
      apyRewardBorrow: Number(market.state.borrowLqDistributionApy) * 100,
      totalSupplyUsd: market.state.totalSupply / (1 - market.state.utilization) / Math.pow(10, market.decimals) * market.price.price,
      totalBorrowUsd: market.state.totalSupply / (1 - market.state.utilization) / Math.pow(10, market.decimals) * market.state.utilization * market.price.price,
      ltv: Number(market.state.maxLoanToValue)
    };
  };

  return [
    getPool("ADA", "addr1wyf3xpvwjd82wtnax8tw8u5k6r5yfh0sza76k7c3y3pgpjcye7ar2"),
    getPool("DJED", "addr1wx5sg32ljez3t25jjr9yg0h7j0lg6e2vr67z9v2k9tc8cwgtw4pw3"),
    getPool("SHEN", "addr1w89fy5nrmfx9n0m8tu7vfpwgj3t4el5m9dg2uhp6xc9x9ng8f88h2"),
    getPool("iUSD", "addr1wyr3h4l5khs9n65sua35vl84tyt8kgwg9mcukhlrf7m6negqfmr8f"),
    getPool("USDC", "addr1wxx955evvve0shn2jfm4pcff4w54fmkxatfqnntj6z845vsk0nq0d")
  ];
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.liqwid.finance/',
};
