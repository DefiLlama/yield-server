const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const utils = require('../utils');

const dataProviderAbi = require('./dataProvider.json');

const CHAIN = 'monad';
const COVENANT = '0x11a7ab0a9d7bd531dbcf0f0630bf7167f8f198f6';
const DATA_PROVIDER = '0x3818a6d5018aa9eb69b6bce09e38a7c24bbe8c22';
const YEAR_SECONDS = 365 * 24 * 60 * 60;
const PROJECT = 'covenant';
const APP_URL = 'https://app.covenant.finance';

// Yield Coin (zToken) is a synthetic claim denominated in the market's quote
// unit (USD or MON), not in the baseToken collateral. Matches Synthetix-v3's
// convention of marking USDC as the underlying for sUSD yield (and shmonad's
// use of WMON for MON-denominated yield).
const USDC_MONAD = '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea';
const WMON = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A';

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

// Markets are discovered at runtime from Covenant's hosted Envio indexer
// (the same endpoint app.covenant.finance uses in production; unauthenticated
// reads). Monad RPCs cap eth_getLogs at 100 blocks, so on-chain CreateMarket
// enumeration is not possible from yield-server. Market *state* is still read
// on-chain via DataProvider below; the indexer only supplies the id list.
// Fails loudly on indexer errors rather than serving a stale market set.
const INDEXER_URL = 'https://indexer.hyperindex.xyz/d06cd15/v1/graphql';
const CHAIN_ID = 143; // Monad mainnet

async function fetchMarketIds() {
  const res = await superagent.post(INDEXER_URL).send({
    query: `query CovenantMarkets($chainId: numeric!) {
      Covenant_Market(where: { chainId: { _eq: $chainId } }) { marketId }
    }`,
    variables: { chainId: CHAIN_ID },
  });
  if (res.body?.errors?.length) {
    throw new Error(
      `covenant indexer error: ${res.body.errors.map((e) => e.message).join('; ')}`
    );
  }
  const ids = (res.body?.data?.Covenant_Market ?? []).map((m) => m.marketId);
  if (!ids.length) throw new Error('covenant indexer returned no markets');
  return ids;
}

async function fetchMonUsdPrice() {
  // Native MON, queried by chain identifier (no contract address for the gas token).
  const res = await superagent.get(
    `https://coins.llama.fi/prices/current/coingecko:monad`
  );
  return res.body?.coins?.['coingecko:monad']?.price ?? null;
}

async function apy() {
  const marketIds = await fetchMarketIds();

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
    let underlying;
    if (quoteSym === 'USD') {
      quoteUsd = 1;
      underlying = USDC_MONAD;
    } else if (quoteSym === 'MON') {
      quoteUsd = monUsd;
      underlying = WMON;
    } else {
      continue;
    }
    if (quoteUsd == null) continue;

    const tvlUsd = zTokenSupplyValueInQuote(d) * quoteUsd;

    pools.push({
      pool: `${d.zToken.tokenAddress.toLowerCase()}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(d.zToken.symbol),
      tvlUsd,
      apyBase,
      underlyingTokens: [underlying.toLowerCase()],
      url: `${APP_URL}/market/${d.marketId.toLowerCase()}?action=swap&input=base&output=yield`,
      poolMeta: `${quoteSym} Yield Coin (backed by ${d.baseToken.symbol})`,
    });
  }
  return pools;
}

module.exports = {
  timetravel: false,
  apy,
  url: APP_URL,
};
