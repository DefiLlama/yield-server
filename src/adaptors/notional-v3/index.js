const { request, gql } = require('graphql-request');
const utils = require('../utils');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

const API = (chain) => `https://data-dev.notional.finance/${chain}/yields`
const NOTE_Mainnet = '0xCFEAead4947f0705A14ec42aC3D44129E1Ef3eD5'

const SUBGRAPHS = {
  arbitrum: 'https://api.studio.thegraph.com/query/36749/notional-v3-arbitrum/version/latest'
};


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

async function getUSDPrice(chain, address) {
  // price of base token in USD terms
  const key = `${chain}:${address}`;
  const priceRes = await superagent.get(
    `https://coins.llama.fi/prices/current/${key}`
  );
  const price = priceRes.body.coins[key];
  return price ? price.price : 0;
}

const getPools = async (chain) => {
  let results = await request(SUBGRAPHS[chain], query);
  const project = 'notional-v3';
  const NOTE = results['NOTE'][0].id
  const NOTEPriceUSD = await getUSDPrice('ethereum', NOTE_Mainnet)

  const nTokens = await Promise.all(results['nTokens'].map(async (n) => {
    const oracles = results['oracles'].filter(({ quote: { symbol } }) => symbol === n.symbol)
    const nTokenExRate = oracles.find(({ oracleType }) => oracleType === 'nTokenToUnderlyingExchangeRate').latestRate
    const nTokenBlendedRate = oracles.find(({ oracleType }) => oracleType === 'nTokenBlendedInterestRate').latestRate
    const nTokenFeeRate = oracles.find(({ oracleType }) => oracleType === 'nTokenFeeRate').latestRate
    const nTokenIncentiveRate = oracles.find(({ oracleType }) => oracleType === 'nTokenIncentiveRate').latestRate
    const underlyingDecimals = BigInt(10) ** BigInt(n.underlying.decimals)
    const tvlUnderlying = (BigInt(n.totalSupply) * BigInt(nTokenExRate)) / BigInt(1e9)
    const underlyingPrice = await getUSDPrice('arbitrum', n.underlying.id)
    const tvlUsd = Number(tvlUnderlying) / 1e8 * underlyingPrice
    const NOTEPriceInUnderlying = NOTEPriceUSD / underlyingPrice

    return {
      pool: `${n.id}-${chain}`,
      chain,
      project,
      symbol: n.symbol,
      rewardTokens: [ NOTE ],
      underlyingTokens: [ n.underlying.id ],
      poolMeta: 'Liquidity Token',
      url: `https://arbitrum.notional.finance/liquidity-variable/${n.underlying.symbol}`,
      tvlUsd,
      apyBase: (Number(nTokenBlendedRate) + Number(nTokenFeeRate)) * 100 / 1e9,
      apyReward: (Number(nTokenIncentiveRate) * NOTEPriceInUnderlying) * 100 / 1e9
    }
  }))

  const primeCash = await Promise.all(results['activeMarkets'].map(async ({ pCashMarket: p }) => {
    const underlyingDecimals = BigNumber(10).pow(p.underlying.decimals)
    const totalSupplyUnderlying = BigNumber(p.current.totalPrimeCashInUnderlying).div(underlyingDecimals)
    const totalDebtUnderlying = BigNumber(p.current.totalPrimeDebtInUnderlying).div(underlyingDecimals)
    const tvlUnderlying = totalSupplyUnderlying.minus(totalDebtUnderlying);
    const underlyingPrice = await getUSDPrice('arbitrum', p.underlying.id)
    const tvlUsd = tvlUnderlying.times(underlyingPrice).toNumber()
    const totalSupplyUsd = totalSupplyUnderlying.times(underlyingPrice).toNumber();
    const totalBorrowUsd = totalDebtUnderlying.times(underlyingPrice).toNumber();

    return {
      pool: `${p.primeCash.id}-${chain}`,
      chain,
      project,
      symbol: p.primeCash.symbol,
      underlyingTokens: [ p.underlying.id ],
      poolMeta: 'Variable Lend',
      url: `https://arbitrum.notional.finance/lend-variable/${p.underlying.symbol}`,
      tvlUsd,
      apyBase: Number(p.current.supplyInterestRate) * 100 / 1e9,
      apyBaseBorrow: Number(p.current.debtInterestRate) * 100 / 1e9,
      totalSupplyUsd,
      totalBorrowUsd,
    }
  }))

  const fCash = await Promise.all(results['activeMarkets'].flatMap(({ fCashMarkets }) => {
    return fCashMarkets.map(async (f) => {
      const underlyingDecimals = BigNumber(10).pow(f.underlying.decimals)
      const totalfCashUnderlying = BigNumber(f.current.totalfCashPresentValue).div(underlyingDecimals)
      const totalDebtUnderlying = BigNumber(f.current.totalfCashDebtOutstandingPresentValue).div(-underlyingDecimals)
      const tvlUnderlying = totalfCashUnderlying.plus(BigNumber(f.current.totalPrimeCashInUnderlying)).div(underlyingDecimals)

      const underlyingPrice = await getUSDPrice('arbitrum', f.underlying.id)
      const tvlUsd = tvlUnderlying.times(underlyingPrice).toNumber()
      const totalSupplyUsd = totalfCashUnderlying.times(underlyingPrice).toNumber();
      const totalBorrowUsd = totalDebtUnderlying.times(underlyingPrice).toNumber();
      const date = (new Date(Number(f.maturity) * 1000)).toISOString().split('T')[0];

      return {
        pool: `${f.fCash.id}-${chain}`,
        chain,
        project,
        symbol: `f${f.underlying.symbol}`,
        underlyingTokens: [ f.underlying.id ],
        poolMeta: `Fixed Lend Maturing On ${date}`,
        url: `https://arbitrum.notional.finance/lend-fixed/${f.underlying.symbol}`,
        tvlUsd,
        apyBase: Number(f.current.lastImpliedRate) * 100 / 1e9,
        apyBaseBorrow: Number(f.current.lastImpliedRate) * 100 / 1e9,
        totalSupplyUsd,
        totalBorrowUsd
      }
    })
  }))

  // TODO: add vaults in the future
  // TODO: add leveraged liquidity in the future
  // const apiResults = await utils.getData(API(chain))
  // const vaults = apiResults.filter((r) => r.token.tokenType === 'VaultShare' && !!r['leveraged'])
  //   .map((v) => {
  //     // TODO: sum up all vaults with this TVL and then select the max APY
  //   return {
  //       pool: `${v.token.id}-${chain}`,
  //       chain,
  //       project,
  //       // NOTE: this is pretty ugly, need better metadata
  //       symbol: v.token.symbol,
  //       underlyingTokens: [ v.token.underlying ],
  //       poolMeta: 'Leveraged Vault',
  //       url: `https://arbitrum.notional.finance/vaults/${v.token.vaultAddress}`,
  //       tvlUsd: Number(tvlUnderlying),
  //       apyBase: Number(f.current.lastImpliedRate) / 1e9,
  //   }
  // })

  return nTokens.concat(primeCash).concat(fCash);
};

const main = async () => {
  return Object.keys(SUBGRAPHS).reduce(async (acc, chain) => {
    return [...(await acc), ...(await getPools(chain))];
  }, Promise.resolve([]));
}

module.exports = {
  timetravel: false,
  apy: main,
};
