const utils = require('../utils');
const _ = require('lodash');
const BigNumber = require('bignumber.js');

// nolus node rest api
const api = 'https://lcd.nolus.network';
// ETL(extract transform load) rest api
const etlAddress = 'https://etl.nolus.network';

// Base decimals for stable price quote (USDC)
const STABLE_QUOTE_DECIMALS = 6;

const queryContract = async function (contract, data) {
  if (typeof data !== 'string') {
    data = JSON.stringify(data);
  }
  let encodedData = Buffer.from(data).toString('base64');
  let endpoint = `${api}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodedData}`;
  const response = await fetch(endpoint);
  const out = await response.json();
  return out;
};

/**
 * Fetches active protocols from the ETL API
 * Returns array of protocol objects with lpp, oracle, symbol, and protocolName
 */
const fetchActiveProtocols = async () => {
  const protocolsData = await utils.getData(
    `${etlAddress}/api/protocols/active`
  );
  const protocols = protocolsData?.protocols || [];

  const symbolMeta = {
    USDC_NOBLE: { symbol: 'USDC', meta: 'Noble' },
    USDC_AXELAR: { symbol: 'USDC', meta: 'Axelar' },
    USDC: { symbol: 'USDC', meta: 'Axelar' },
    ALL_SOL: { symbol: 'SOL', meta: 'Alloyed' },
    ALL_BTC: { symbol: 'BTC', meta: 'Alloyed' },
  };

  return protocols
    .filter((p) => p.contracts?.lpp && p.contracts?.oracle)
    .map((p) => {
      const override = symbolMeta[p.lpn_symbol];
      return {
        lpp: p.contracts.lpp,
        oracle: p.contracts.oracle,
        symbol: override ? override.symbol : p.lpn_symbol,
        protocolName: p.name,
        meta: override ? override.meta : '',
      };
    });
};

/**
 * Fetches currencies from the ETL API and builds a decimals lookup map
 * Returns a map of ticker -> decimal_digits
 */
const fetchCurrencyDecimals = async () => {
  const currenciesData = await utils.getData(`${etlAddress}/api/currencies`);
  const currencies = currenciesData?.currencies || [];

  const decimalsMap = {};
  for (const currency of currencies) {
    if (currency.is_active) {
      decimalsMap[currency.ticker] = currency.decimal_digits;
    }
  }
  return decimalsMap;
};

/**
 * Calculates the decimal adjustment factor for price calculation
 * When the LPN token has more decimals than the stable quote (6),
 * we need to multiply the price by 10^(lpn_decimals - stable_decimals)
 */
const getDecimalAdjustment = (lpnDecimals) => {
  const decimalDiff = lpnDecimals - STABLE_QUOTE_DECIMALS;
  return decimalDiff > 0 ? Math.pow(10, decimalDiff) : 1;
};

const getApy = async () => {
  // Fetch active protocols dynamically from ETL
  const contracts = await fetchActiveProtocols();

  // Fetch currency decimals for dynamic adjustment
  const currencyDecimals = await fetchCurrencyDecimals();

  // Fetch all pool data in a single request
  const poolsData = await utils.getData(`${etlAddress}/api/pools`);
  const poolsMap = {};
  for (const pool of poolsData?.protocols || []) {
    poolsMap[pool.protocol] = pool;
  }

  let result = [];
  for (let i = 0; i < contracts.length; i++) {
    const c = contracts[i];
    let lppTickerData = await queryContract(c.lpp, { lpn: [] });
    let oracleCurrenciesData = await queryContract(c.oracle, {
      currencies: {},
    });
    let oraclePriceData = await queryContract(c.oracle, {
      stable_price: { currency: lppTickerData.data },
    });
    let currencyData = _.find(
      oracleCurrenciesData.data,
      (n) => n.ticker == lppTickerData.data
    );

    if (
      !currencyData ||
      !oraclePriceData?.data?.amount?.amount ||
      !oraclePriceData?.data?.amount_quote?.amount
    ) {
      continue;
    }

    let lppBalanceData = await queryContract(c.lpp, { lpp_balance: [] });

    // Get pool data from poolsMap
    const poolData = poolsMap[c.protocolName];
    const earnApr = Number(poolData?.earn_apr);
    const borrowApr = Number(poolData?.borrow_apr);
    const totalSupplyUsd = Number(poolData?.supplied);
    const totalBorrowUsd = Number(poolData?.borrowed);
    const safeEarnApr = Number.isFinite(earnApr) ? earnApr : 0;
    const safeBorrowApr = Number.isFinite(borrowApr) ? borrowApr : 0;
    const safeTotalSupplyUsd = Number.isFinite(totalSupplyUsd)
      ? totalSupplyUsd
      : 0;
    const safeTotalBorrowUsd = Number.isFinite(totalBorrowUsd)
      ? totalBorrowUsd
      : 0;

    // Calculate asset price with BigNumber
    const amount = new BigNumber(oraclePriceData.data.amount.amount);
    const amountQuote = new BigNumber(oraclePriceData.data.amount_quote.amount);
    let price = amountQuote.div(amount);

    // Get LPN decimals from currencies API and calculate adjustment
    const lpnDecimals = currencyDecimals[c.symbol] ?? STABLE_QUOTE_DECIMALS;
    const decimalsAdjustment = getDecimalAdjustment(lpnDecimals);
    price = price.times(decimalsAdjustment);

    // Calculate TVL in USD
    const balance = new BigNumber(lppBalanceData.data.balance.amount);
    const tvlUsd = balance
      .div(new BigNumber(10).pow(currencyData.decimal_digits))
      .times(price);

    result.push({
      pool: c.lpp,
      chain: 'Nolus',
      project: 'nolus-protocol',
      symbol: c.symbol,
      tvlUsd: tvlUsd.toNumber(),
      apyBase: safeEarnApr,
      apyBaseBorrow: safeBorrowApr,
      apyRewardBorrow: 0, // No borrowing incentives
      totalSupplyUsd: safeTotalSupplyUsd,
      totalBorrowUsd: safeTotalBorrowUsd,
      // apyReward: null, TODO: add NLS rewards
      underlyingTokens: [currencyData.bank_symbol, currencyData.dex_symbol], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
      // rewardTokens: ['0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9'], TODO: add NLS rewards
      poolMeta: c.meta,
    });
  }

  return result;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.nolus.io/earn',
};

// cd src/adaptors && npm run test --adapter=nolus-protocol
