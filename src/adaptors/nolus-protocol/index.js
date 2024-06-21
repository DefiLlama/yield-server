const utils = require('../utils')
const _ = require('lodash')

// Osmosis Noble USDC Protocol Contracts (OSMOSIS-OSMOSIS-USDC_NOBLE) pirin-1
const osmosisNobleOracleAddr = 'nolus1vjlaegqa7ssm2ygf2nnew6smsj8ref9cmurerc7pzwxqjre2wzpqyez4w6'
const osmosisNobleLppAddr = 'nolus1ueytzwqyadm6r0z8ajse7g6gzum4w3vv04qazctf8ugqrrej6n4sq027cf'

// Astroport Protocol Contracts (NEUTRON-ASTROPORT-USDC_AXELAR) pirin-1
const astroportOracleAddr = 'nolus1jew4l5nq7m3xhkqzy8j7cc99083m5j8d9w004ayyv8xl3yv4h0dql2dd4e'
const astroportLppAddr = 'nolus1qqcr7exupnymvg6m63eqwu8pd4n5x6r5t3pyyxdy7r97rcgajmhqy3gn94'

const contracts = [
  { lpp: osmosisNobleLppAddr, oracle: osmosisNobleOracleAddr },
  { lpp: astroportLppAddr, oracle: astroportOracleAddr }
]

// nolus node rest api
const api = 'https://pirin-cl.nolus.network:1317'
// ETL(extract transform load) rest api
const etlAddress = 'https://etl-cl.nolus.network:8080'
// api/max_ls_interest_7d/{lpp_address}
const dailyMaxInterestEp = 'api/max_ls_interest_7d'
// api/max_lp_ratio/{lpp_address}
const maxLpRatioEp = 'api/max_lp_ratio'

const queryContract = async function (contract, data) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data)
  }
  let encodedData = Buffer.from(data).toString('base64');
  let endpoint = `${api}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodedData}`
  return await await utils.getData(endpoint)
}

const getApy = async () => {
  let result = []
  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    let lppTickerData = await queryContract(c.lpp, { 'lpn': [] })
    let oracleData = await queryContract(c.oracle, { 'currencies': {} })
    let currencyData = _.find(oracleData.data, (n) => n.ticker == lppTickerData.data)
    let lppBalanceData = await queryContract(c.lpp, { 'lpp_balance': [] })
    let dailyMaxLSInterest = await utils.getData(`${etlAddress}/${dailyMaxInterestEp}/${c.lpp}`)
    let dailyMaxLPRatio = await utils.getData(`${etlAddress}/${maxLpRatioEp}/${c.lpp}`)

    let merged = []
    for (const date in dailyMaxLSInterest) {
      if (!!dailyMaxLPRatio[date]) {
        merged.push({
          'mli': dailyMaxLSInterest[date],
          'mlr': dailyMaxLPRatio[date]
        })
      }
    }

    let avg = merged.reduce((acc, curr) => acc + (curr.mli - 40) * curr.mlr, 0) / merged.length
    let apr = avg / 10
    let apy = (Math.pow((1 + (apr / 100 / 365)), 365) - 1) * 100

    result.push({
      pool: c.lpp,
      chain: 'Nolus',
      project: 'nolus-protocol',
      symbol: 'USDC',
      tvlUsd: Number(lppBalanceData.data.balance.amount) / Math.pow(10, currencyData.decimal_digits),
      apyBase: apy,
      // apyReward: null, TODO: add NLS rewards
      underlyingTokens: [currencyData.bank_symbol, currencyData.dex_symbol], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
      // rewardTokens: ['0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9'], TODO: add NLS rewards
      poolMeta: lppTickerData.data.substr('USDC_'.length),
    })
  }

  return result
}

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.nolus.io/earn',
}

// cd src/adaptors && npm run test --adapter=nolus-protocol
