const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');

const dataProviderAbi = require('./dataProvider.json');

const CHAIN = 'monad';
const COVENANT = '0x11a7ab0a9d7bd531dbcf0f0630bf7167f8f198f6';
const DATA_PROVIDER = '0x3818a6d5018aa9eb69b6bce09e38a7c24bbe8c22';
const DEPLOY_BLOCK = 35851140;
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const PROJECT = 'covenant';
const POOL_URL = 'https://covenant.finance';

const createMarketEvent =
  'event CreateMarket(bytes20 indexed marketId, (address baseToken, address quoteToken, address curator, address lex) marketParams, (address aToken, address zToken) synthTokens, bytes initData, bytes lexData)';

const getMarketsDetailsAbi = dataProviderAbi.find(
  (x) => x.name === 'getMarketsDetails'
);

// Mirrors PRICE_DIVISOR in covenant-interface/data/adapters/EVMBlockchainAdapter.ts:45
// (10^(2 * 18) — synth prices are pre-scaled so balance × price / 1e36 yields
// the value in quote whole units regardless of token decimal mismatches).
const PRICE_DIVISOR_WAD = 10n ** 18n;

// Mirrors covenant-interface/data/adapters/EVMBlockchainAdapter.ts:483-504.
// Computes the Yield Coin (zToken / debt token) APY.
function computeYieldCoinApy(d) {
  const discount = Number(d.debtPriceDiscount) / 1e18;
  if (!isFinite(discount) || discount <= 0) return null;
  const lnRateBias = Number(d.lexState.lastLnRateBias) / 1e18;
  const debtDuration = Number(d.lexParams.debtDuration);
  if (debtDuration === 0) return null;
  const rate = lnRateBias - Math.log(discount);
  const apy = (Math.exp(rate * (YEAR_SECONDS / debtDuration)) - 1) * 100;
  return isFinite(apy) ? apy : null;
}

// zToken supply value in quote-token whole units. Spot-price (marginal) basis,
// matching the convention DefiLlama uses for other tranching protocols.
function zTokenSupplyValueInQuote(d) {
  const supply = BigInt(d.zToken.totalSupply.toString());
  const price = BigInt(d.tokenPrices.zTokenPrice.toString());
  // (supply * price) / 1e36, kept as a float for downstream USD multiplication.
  // Scale down one factor of 1e18 in bigint, then convert and divide by the other 1e18.
  const wad = (supply * price) / PRICE_DIVISOR_WAD;
  return Number(wad) / 1e18;
}

async function listMarketIds() {
  const logs = await sdk.getEventLogs({
    target: COVENANT,
    eventAbi: createMarketEvent,
    fromBlock: DEPLOY_BLOCK,
    toTimestamp: Math.floor(Date.now() / 1000),
    chain: CHAIN,
  });
  return logs.map((l) => l.args.marketId);
}

async function fetchMonUsdPrice() {
  // Native MON, queried by chain identifier (no contract address for the gas token).
  const res = await superagent.get(
    `https://coins.llama.fi/prices/current/coingecko:monad`
  );
  return res.body?.coins?.['coingecko:monad']?.price ?? null;
}

async function apy() {
  const marketIds = await listMarketIds();
  if (!marketIds.length) return [];

  const { output: details } = await sdk.api.abi.call({
    target: DATA_PROVIDER,
    abi: getMarketsDetailsAbi,
    params: [COVENANT, marketIds],
    chain: CHAIN,
  });

  const needsMon = details.some((d) => d.quoteToken.symbol === 'MON');
  const monUsd = needsMon ? await fetchMonUsdPrice() : null;

  const pools = [];
  for (const d of details) {
    if (Number(d.marketState.statusFlag) === 0) continue;

    const apyBase = computeYieldCoinApy(d);
    if (apyBase === null) continue;

    const quoteSym = d.quoteToken.symbol;
    let quoteUsd;
    if (quoteSym === 'USD') quoteUsd = 1;
    else if (quoteSym === 'MON') quoteUsd = monUsd;
    else quoteUsd = null;
    if (quoteUsd == null) continue;

    const tvlUsd = zTokenSupplyValueInQuote(d) * quoteUsd;

    pools.push({
      pool: `${d.zToken.tokenAddress.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(d.zToken.symbol),
      tvlUsd,
      apyBase,
      underlyingTokens: [d.marketParams.baseToken.toLowerCase()],
      url: POOL_URL,
      poolMeta: `${d.baseToken.symbol}/${quoteSym} Yield Coin`,
    });
  }
  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: POOL_URL,
};
