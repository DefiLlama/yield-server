const { default: BigNumber } = require('bignumber.js')
const { request, gql } = require('graphql-request')

const endpoint = 'https://api.thegraph.com/subgraphs/name/predy-dev/predy-fee-arbitrum'

const query = gql`
  query ($address: String, $strategyId: Int) {
    aggregatedUniswapPriceEntities(
      first: 7
      where: { address: $address, strategyId: $strategyId, interval: "DAILY" }
      orderBy: openTimestamp
      orderDirection: desc
    ) {
      id
      address
      strategyId
      interval
      openPrice
      closePrice
      openTimestamp
      closeTimestamp
    }
  }
`

const strategies = [
  {
    id: 1,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of WETH-USDC.e 0.05% pool',
    strategyTokenAddress: '0x5037Df4301489C96F17E3E2eBE55bFF909098043'
  },
  {
    id: 2,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of ARB-USDC.e 0.3% pool',
    strategyTokenAddress: '0xBd0a8a71283c92123A3cAE4E7Cb71D410973A9e1'
  },
  {
    id: 3,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of LUSD-USDC.e 0.05% pool',
    strategyTokenAddress: '0xaA25788310eEf9E78e7D601EF727f19BE0944463'
  },
  {
    id: 4,
    symbol: 'USDC.e',
    poolMeta: 'Gamma short strategy of WETH-USDC.e 0.05% extra pool',
    strategyTokenAddress: '0xde2781A9eA08E75149EF5EdC9CF97d44F1c05a0c'
  }
]


function getApr(latest, start) {
  const latestPrice = new BigNumber(latest.closePrice)
  const startPrice = new BigNumber(start.closePrice)
  const apr = latestPrice.times(1000000).div(startPrice).minus(1000000)
  const span = Number(latest.closeTimestamp) - Number(start.closeTimestamp)

  if (span === 0) {
    return 0
  }

  return (apr.toNumber() / 10000) * (60 * 60 * 24 * 365) / span
}


const strategyApys = async () => {
  const strategyAddress = '0x247d8E00a2714665a5231f4AB165839d943C1838'

  return await Promise.all(
    strategies.map(async (strategy) => {
      const prices = (await request(endpoint, query, {
        address: strategyAddress,
        strategyId: strategy.id
      })).aggregatedUniswapPriceEntities

      const apy = getApr(
        prices[0],
        prices[prices.length >= 7 ? 6 : prices.length - 1]
      );

      return {
        pool: `${strategy.strategyTokenAddress}-arbitrum`,
        chain: 'Arbitrum',
        project: 'predy-strategy',
        symbol: strategy.symbol,
        poolMeta: strategy.poolMeta,
        apyBase: apy,
        url: `https://v5app.predy.finance/trade/usdce/strategy/${strategy.id}`,
      }
    })
  )
};

module.exports = {
  timetravel: false,
  apy: strategyApys,
  url: 'https://appv5.predy.finance',
};
