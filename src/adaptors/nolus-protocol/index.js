const utils = require('../utils')
const _ = require('lodash')
const BigNumber = require('bignumber.js');

// Osmosis Noble USDC Protocol Contracts (OSMOSIS-OSMOSIS-USDC_NOBLE) pirin-1
const osmosisUsdcOracleAddr = 'nolus1vjlaegqa7ssm2ygf2nnew6smsj8ref9cmurerc7pzwxqjre2wzpqyez4w6'
const osmosisUsdcLppAddr = 'nolus1ueytzwqyadm6r0z8ajse7g6gzum4w3vv04qazctf8ugqrrej6n4sq027cf'

// Osmosis stATOM Protocol Contracts (OSMOSIS-OSMOSIS-ST_ATOM) pirin-1 
//Note: APY is 0% atm, so not worth adding, but might in the future
//const osmosisStAtomOracleAddr = 'nolus1mtcv0vhpt94s82mcemj5sc3v94pq3k2g62yfa5p82npfnd3xqx8q2w8c5f'
//const osmosisStAtomLppAddr = 'nolus1jufcaqm6657xmfltdezzz85quz92rmtd88jk5x0hq9zqseem32ysjdm990'

// Osmosis allBTC Protocol Contracts (OSMOSIS-OSMOSIS-ALL_BTC) pirin-1
const osmosisAllBtcOracleAddr = 'nolus1y0nlrnw25mh2vxhaupamwca4wdvuxs26tq4tnxgjk8pw0gxevwfq5ry07c'
const osmosisAllBtcLppAddr = 'nolus1w2yz345pqheuk85f0rj687q6ny79vlj9sd6kxwwex696act6qgkqfz7jy3'

// Osmosis allSOL Protocol Contracts (OSMOSIS-OSMOSIS-ALL_SOL) pirin-1
const osmosisAllSolOracleAddr = 'nolus153kmhl85vavd03r9c7ardw4fgydge6kvvhrx5v2uvec4eyrlwthsejc6ce'
const osmosisAllSolLppAddr = 'nolus1qufnnuwj0dcerhkhuxefda6h5m24e64v2hfp9pac5lglwclxz9dsva77wm'

// Osmosis AKT Protocol Contracts (OSMOSIS-OSMOSIS-AKT) pirin-1
//Note: APY is 0% atm, so not worth adding, but might in the future
//const osmosisAktOracleAddr = 'nolus12sx0kr60rptp846z2wvuwyxn47spg55dcnzwrhl4f7nfdduzsrxq7rfetn'
//const osmosisAktLppAddr = 'nolus1lxr7f5xe02jq6cce4puk6540mtu9sg36at2dms5sk69wdtzdrg9qq0t67z'

// Astroport USDC Protocol Contracts (NEUTRON-ASTROPORT-USDC_NOBLE) pirin-1
const astroportUsdcOracleAddr = 'nolus1vhzdx9lqexuqc0wqd48c5hc437yzw7jy7ggum9k25yy2hz7eaatq0mepvn'
const astroportUsdcLppAddr = 'nolus17vsedux675vc44yu7et9m64ndxsy907v7sfgrk7tw3xnjtqemx3q6t3xw6'

const contracts = [
  { lpp: osmosisUsdcLppAddr, oracle: osmosisUsdcOracleAddr, symbol: 'USDC', meta: '', protocolInterest: 40},
  { lpp: osmosisAllBtcLppAddr, oracle: osmosisAllBtcOracleAddr, symbol: 'BTC', meta: '', protocolInterest: 15 },
  { lpp: osmosisAllSolLppAddr, oracle: osmosisAllSolOracleAddr, symbol: 'SOL', meta: '', protocolInterest: 40 },
  { lpp: astroportUsdcLppAddr, oracle: astroportUsdcOracleAddr, symbol: 'USDC', meta: '', protocolInterest: 40 }
]

// nolus node rest api
const api = 'https://lcd.nolus.network'
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
    let oracleCurrenciesData = await queryContract(c.oracle, { 'currencies': {} })
    let oraclePriceData = await queryContract(c.oracle, { 'stable_price': {'currency': lppTickerData.data} })
    let currencyData = _.find(oracleCurrenciesData.data, (n) => n.ticker == lppTickerData.data)
    let lppBalanceData = await queryContract(c.lpp, { 'lpp_balance': [] })
    let dailyMaxLSInterest = await utils.getData(`${etlAddress}/${dailyMaxInterestEp}/${c.lpp}`)
    let dailyMaxLPRatio = await utils.getData(`${etlAddress}/${maxLpRatioEp}/${c.lpp}`)

    // Calculate asset price with BigNumber
    const amount = new BigNumber(oraclePriceData.data.amount.amount);
    const amountQuote = new BigNumber(oraclePriceData.data.amount_quote.amount);
    let price = amountQuote.div(amount);

    // Adjust price for decimal differences
    const decimalsAdjustment = {
      USDC: 1,
      BTC: 100, // 8 - 6 = 2 decimal places difference, 10^2 = 100
      SOL: 1000 // 9 - 6 = 3 decimal places difference, 10^3 = 1000
    };
    price = price.times(decimalsAdjustment[c.symbol] || 1); // Default to 1 if symbol is not in the map

    // Calculate TVL in USD
    const balance = new BigNumber(lppBalanceData.data.balance.amount);
    const tvlUsd = balance.div(new BigNumber(10).pow(currencyData.decimal_digits)).times(price);

    let merged = []
    for (const date in dailyMaxLSInterest) {
      if (!!dailyMaxLPRatio[date]) {
        merged.push({
          'mli': dailyMaxLSInterest[date],
          'mlr': dailyMaxLPRatio[date]
        })
      }
    }

    let avg = merged.reduce((acc, curr) => acc + (curr.mli - contracts[i].protocolInterest) * curr.mlr, 0) / merged.length
    let apr = avg / 10
    let apy = (Math.pow((1 + (apr / 100 / 365)), 365) - 1) * 100

    result.push({
      pool: c.lpp,
      chain: 'Nolus',
      project: 'nolus-protocol',
      symbol: contracts[i].symbol,
      tvlUsd: tvlUsd.toNumber(),
      apyBase: apy,
      // apyReward: null, TODO: add NLS rewards
      underlyingTokens: [currencyData.bank_symbol, currencyData.dex_symbol], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
      // rewardTokens: ['0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9'], TODO: add NLS rewards
      poolMeta: contracts[i].meta,
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
