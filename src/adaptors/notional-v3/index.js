const { request, gql } = require('graphql-request');
const utils = require('../utils');

const v3subgraphArbitrum = 'https://api.studio.thegraph.com/query/33671/notional-finance-arb-history/version/latest'
const query = gql`
query GetYieldsData {
    oracles(where: {
      matured: false,
      oracleType_in: [
        nTokenToUnderlyingExchangeRate,
        nTokenBlendedInterestRate,
        nTokenFeeRate,
        nTokenIncentiveRate
      ],
    }, first: 1000) {
      base { id }
      quote { id symbol }
      decimals
      oracleType
      latestRate
    }
    NOTE: tokens(where: { tokenType: NOTE}) { id }
    # Use this to calculate the nToken TVL
    nTokens: tokens(where: { tokenType: nToken}) {
      id
      symbol
      totalSupply
      underlying {id symbol decimals}
    }
  	activeMarkets {
      pCashMarket {
        underlying { id symbol decimals }
        primeCash { id symbol decimals }
        primeDebt { id symbol decimals }
        current {
          totalPrimeCashInUnderlying
          totalPrimeDebtInUnderlying
          supplyInterestRate
          debtInterestRate
        }
      }
      fCashMarkets {
        maturity
        underlying { id symbol decimals }
        fCash { id symbol decimals }
        current {
          lastImpliedRate
          totalfCashPresentValue
          totalPrimeCashInUnderlying
          totalfCashDebtOutstandingPresentValue
        }
      }
    }
  }
`

const main = async () => {
  let results = await request(v3subgraphArbitrum, query);
  const project = 'notional-v3';
  const NOTE = results['NOTE'][0].id

  const nTokens = results['nTokens'].map((n) => {
    const oracles = results['oracles'].filter(({ quote: { symbol } }) => symbol === n.symbol)
    const nTokenExRate = oracles.find(({ oracleType }) => oracleType === 'nTokenToUnderlyingExchangeRate').latestRate
    const nTokenBlendedRate = oracles.find(({ oracleType }) => oracleType === 'nTokenBlendedInterestRate').latestRate
    const nTokenFeeRate = oracles.find(({ oracleType }) => oracleType === 'nTokenFeeRate').latestRate
    const nTokenIncentiveRate = oracles.find(({ oracleType }) => oracleType === 'nTokenIncentiveRate').latestRate
    const underlyingDecimals = BigInt(10) ** BigInt(n.underlying.decimals)
    const tvlUnderlying = (BigInt(n.totalSupply) * BigInt(nTokenExRate)) / BigInt(1e9)
    // TODO: Fix this
    const NOTEPriceInUnderlying = 0.15

    return {
      pool: `${n.id}-arbitrum`,
      chain: 'Arbitrum',
      project,
      symbol: n.symbol,
      rewardTokens: [ NOTE ],
      underlyingTokens: [ n.underlying.id ],
      poolMeta: 'Liquidity Token',
      url: `https://arbitrum.notional.finance/liquidity-variable/${n.underlying.symbol}`,
      tvlUsd: Number(tvlUnderlying) / 1e8,
      apyBase: (Number(nTokenBlendedRate) + Number(nTokenFeeRate)) / 1e9,
      apyReward: (Number(nTokenIncentiveRate) * NOTEPriceInUnderlying) / 1e9
    }
  })

  const primeCash = results['activeMarkets'].map(({ pCashMarket: p }) => {
    const underlyingDecimals = BigInt(10) ** BigInt(p.underlying.decimals)
    const totalSupplyUnderlying = BigInt(p.current.totalPrimeCashInUnderlying) / underlyingDecimals
    const totalDebtUnderlying = BigInt(p.current.totalPrimeDebtInUnderlying) / underlyingDecimals
    const tvlUnderlying = totalSupplyUnderlying - totalDebtUnderlying

    return {
      pool: `${p.primeCash.id}-arbitrum`,
      chain: 'Arbitrum',
      project,
      symbol: p.primeCash.symbol,
      underlyingTokens: [ p.underlying.id ],
      poolMeta: 'Variable Lend',
      url: `https://arbitrum.notional.finance/lend-variable/${p.underlying.symbol}`,
      tvlUsd: Number(tvlUnderlying),
      apyBase: Number(p.current.supplyInterestRate) / 1e9,
      apyBaseBorrow: Number(p.current.debtInterestRate) / 1e9,
      totalSupplyUsd: Number(totalSupplyUnderlying),
      totalBorrowUsd: Number(totalDebtUnderlying),
      // ltv?: number; // btw [0, 1]
    }
  })

  const fCash = results['activeMarkets'].flatMap(({ fCashMarkets }) => {
    return fCashMarkets.map((f) => {
      const underlyingDecimals = BigInt(10) ** BigInt(f.underlying.decimals)
      const totalfCashUnderlying = BigInt(f.current.totalfCashPresentValue) / underlyingDecimals
      const totalDebtUnderlying = -BigInt(f.current.totalfCashDebtOutstandingPresentValue) / underlyingDecimals
      const tvlUnderlying = totalfCashUnderlying + BigInt(f.current.totalPrimeCashInUnderlying) / underlyingDecimals

      return {
        pool: `${f.fCash.id}-arbitrum`,
        chain: 'Arbitrum',
        project,
        symbol: f.fCash.symbol,
        underlyingTokens: [ f.underlying.id ],
        poolMeta: 'Fixed Lend',
        url: `https://arbitrum.notional.finance/lend-fixed/${f.underlying.symbol}`,
        tvlUsd: Number(tvlUnderlying),
        apyBase: Number(f.current.lastImpliedRate) / 1e9,
        apyBaseBorrow: Number(f.current.lastImpliedRate) / 1e9,
        totalSupplyUsd: Number(totalfCashUnderlying),
        totalBorrowUsd: Number(totalDebtUnderlying),
        // ltv?: number; // btw [0, 1]
      }
    })
  })

  // TODO: need to add vaults...
  return nTokens.concat(primeCash).concat(fCash);
};

module.exports = {
  timetravel: false,
  apy: main,
};
