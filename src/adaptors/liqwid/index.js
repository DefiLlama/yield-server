const { request, gql } = require('graphql-request');

const apy = async () => {
  const endpoint = 'https://api.liqwid.dev/graphql'

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
          supplyMarketParticipationAPR
          maxLoanToValue
        }
        info {
          scripts {
            batchFinal {
              hash
            }
          }
        }
        price {
          price
        }
        decimals
      }
    }
    adaStakingAPY
  }
  `
  const data = await request(endpoint, query)
  const markets = data.Page.market;
  const adaStakingAPY = data.adaStakingAPY; // ada liquid staking

  const getPool = (tokenName) => {
    const market = markets.filter((market) => market.asset.name === tokenName)[0];

    return {
      // FIXME(Kylix, 20th Sep 2023): Construct Shelley address from hex scripthash
      pool: market.info.scripts.batchFinal.hash.value0, // market batch final hash
      chain: "Cardano",
      project: "liqwid",
      symbol: market.asset.name,
      tvlUsd: market.state.totalSupply / Math.pow(10, market.decimals) * market.price.price,
      apyBase: (tokenName == "ADA" ? adaStakingAPY : 0 + Number(market.state.supplyApy)) * 100,
      apyReward: Number(market.state.supplyMarketParticipationAPR) * 100,
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
    getPool("ADA"),
    getPool("DJED"),
    getPool("SHEN"),
    getPool("iUSD"),
    getPool("USDC"),
    getPool("USDT"),
    getPool("DAI"),
    getPool("AGIX"),
    getPool("WMT"),
    getPool("MIN")
  ];
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.liqwid.finance/',
};
