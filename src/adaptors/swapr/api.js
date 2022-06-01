const { gql } = require("graphql-request")

exports.queries = {
    QUERY_PAIRS: gql`{
        pairs(first: 1000 orderDirection: desc block: {number: <PLACEHOLDER>}) {
          id
          volumeUSD
          reserve0
          reserve1
          totalSupply
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
        }
    }`,
    QUERY_LIQUIDITY_MINING_CAMPAIGNS: gql`
    {
      liquidityMiningCampaigns(first: 1000) {
        id
        duration
        startsAt
        endsAt
        locked
        stakingCap
        stakedAmount
        rewards {
          token {
            id
            name
          }
          amount
        }
        stakablePair {
          id
          reserveNativeCurrency
          reserveUSD
          totalSupply
          reserve0
          reserve1
          token0 {
            id
          }
          token1 {
            id
          }
        }
      }
    }
    `,
    QUERY_KPI_TOKENS: gql`
    {
      kpiTokens(first: 1000) {
        id
        symbol
        name
        totalSupply
        kpiId
        collateral {
          token {
            id
            symbol
            name
            decimals
          }
            amount
          }
      }
    }
    `,
    QUERY_TOKEN: gql`
    {
      token(id: <PLACEHOLDER>) {
        id
        derivedNativeCurrency
      }
    }
    `,
    QUERY_NATIVE_CURRENCY_USD: gql`
    {
      bundle(id: "1") {
          nativeCurrencyPrice
      }
    }
    `
}