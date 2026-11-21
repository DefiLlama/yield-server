const axios = require('axios');
const stellarSdk = require('@stellar/stellar-sdk');
const { getPriceApiCoins, keepFinite, formatChain } = require('../utils');

// Soroswap AMM (uni-v2 style, 0.3% fee to LPs) on Stellar Soroban.
// https://github.com/soroswap/core (public/mainnet.contracts.json)
const FACTORY = 'CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2';
const FEE_RATE = 0.003;
const SOROBAN_RPC_URL = 'https://soroban-rpc.creit.tech/';
// Deterministic, unfunded account used only to simulate read-only Soroban calls.
const SOROBAN_READ_ACCOUNT = stellarSdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32));
const CONCURRENCY = 10;
const EVENTS_PAGE = 1000;

const server = new stellarSdk.rpc.Server(SOROBAN_RPC_URL);

async function sorobanRead(contractId, method, args = []) {
  const account = new stellarSdk.Account(SOROBAN_READ_ACCOUNT, '0');
  const tx = new stellarSdk.TransactionBuilder(account, {
    fee: stellarSdk.BASE_FEE,
    networkPassphrase: stellarSdk.Networks.PUBLIC,
  })
    .addOperation(new stellarSdk.Contract(contractId).call(method, ...args))
    .setTimeout(30)
    .build();
  // Raw JSON-RPC: the bundled stellar-sdk cannot parse current simulation
  // transactionData, and only the return value is needed here.
  const { data } = await axios.post(SOROBAN_RPC_URL, {
    jsonrpc: '2.0',
    id: 1,
    method: 'simulateTransaction',
    params: { transaction: tx.toXDR() },
  });
  const result = data.result;
  if (data.error || result?.error || !result?.results?.[0])
    throw new Error(`${contractId}.${method}: ${JSON.stringify(data.error || result?.error)}`);
  return stellarSdk.scValToNative(
    stellarSdk.xdr.ScVal.fromXDR(result.results[0].xdr, 'base64')
  );
}

async function mapLimit(items, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += CONCURRENCY)
    out.push(...(await Promise.all(items.slice(i, i + CONCURRENCY).map(fn))));
  return out;
}

async function getPairs() {
  const count = Number(await sorobanRead(FACTORY, 'all_pairs_length'));
  const indexes = [...Array(count).keys()];
  const addresses = await mapLimit(indexes, (i) =>
    sorobanRead(FACTORY, 'all_pairs', [stellarSdk.nativeToScVal(i, { type: 'u32' })])
  );
  return mapLimit(addresses, async (address) => {
    const [token0, token1, reserves] = await Promise.all([
      sorobanRead(address, 'token_0'),
      sorobanRead(address, 'token_1'),
      sorobanRead(address, 'get_reserves'),
    ]);
    return { address, token0, token1, reserve0: reserves[0], reserve1: reserves[1] };
  });
}

// Swap events emitted by factory pairs over the RPC's retention window (~24h).
// Returns raw in/out amounts per pair and the window length in seconds.
async function getSwapAmounts(pairSet) {
  const health = await server.getHealth();
  const topics = [[
    stellarSdk.xdr.ScVal.scvString('SoroswapPair').toXDR('base64'),
    stellarSdk.xdr.ScVal.scvSymbol('swap').toXDR('base64'),
  ]];
  const filters = [{ type: 'contract', topics }];
  // stay a few ledgers inside the window so the start ledger is not pruned mid-request
  let request = { startLedger: health.oldestLedger + 10, filters, limit: EVENTS_PAGE };
  const amounts = {};
  let firstClose, lastClose;

  while (true) {
    const res = await server.getEvents(request);
    for (const e of res.events) {
      const pair = e.contractId.toString();
      if (!pairSet.has(pair) || e.inSuccessfulContractCall === false) continue;
      const v = stellarSdk.scValToNative(e.value);
      const a = (amounts[pair] = amounts[pair] || { in0: 0n, in1: 0n, out0: 0n, out1: 0n });
      a.in0 += BigInt(v.amount_0_in);
      a.in1 += BigInt(v.amount_1_in);
      a.out0 += BigInt(v.amount_0_out);
      a.out1 += BigInt(v.amount_1_out);
      const t = Date.parse(e.ledgerClosedAt) / 1000;
      if (firstClose === undefined) firstClose = t;
      lastClose = t;
    }
    if (res.events.length < EVENTS_PAGE) break;
    request = { cursor: res.cursor, filters, limit: EVENTS_PAGE };
  }

  const windowSeconds =
    Number(health.latestLedgerCloseTime) - Number(health.oldestLedgerCloseTime);
  return { amounts, windowSeconds };
}

const apy = async () => {
  const pairs = await getPairs();
  const pairSet = new Set(pairs.map((p) => p.address));
  const tokens = [...new Set(pairs.flatMap((p) => [p.token0, p.token1]))];

  const [coins, { amounts, windowSeconds }] = await Promise.all([
    getPriceApiCoins(tokens.map((t) => `stellar:${t}`)),
    getSwapAmounts(pairSet),
  ]);
  const coinOf = (t) => coins[`stellar:${t}`] || coins[`stellar:${t.toLowerCase()}`];
  const usd = (t, raw) => {
    const c = coinOf(t);
    return c ? (Number(raw) / 10 ** c.decimals) * c.price : undefined;
  };
  const dayScale = windowSeconds > 0 ? 86400 / windowSeconds : 1;

  const pools = pairs.map((p) => {
    const c0 = coinOf(p.token0);
    const c1 = coinOf(p.token1);
    if (!c0 && !c1) return null;

    const r0 = usd(p.token0, p.reserve0);
    const r1 = usd(p.token1, p.reserve1);
    // uni-v2 pools hold equal value on both sides; price an unknown side from the known one
    const tvlUsd = c0 && c1 ? r0 + r1 : 2 * (r0 ?? r1);

    const a = amounts[p.address];
    let volumeUsd1d = 0;
    if (a) {
      const vol =
        c0 && c1
          ? usd(p.token0, a.in0) + usd(p.token1, a.in1)
          : c0
            ? usd(p.token0, a.in0 + a.out0)
            : usd(p.token1, a.in1 + a.out1);
      volumeUsd1d = vol * dayScale;
    }

    const apyBase = tvlUsd > 0 ? ((volumeUsd1d * FEE_RATE * 365) / tvlUsd) * 100 : 0;
    const symbol = `${c0?.symbol ?? '?'}-${c1?.symbol ?? '?'}`;

    return {
      pool: `${p.address}-stellar`,
      chain: formatChain('stellar'),
      project: 'soroswap',
      symbol,
      tvlUsd,
      apyBase,
      underlyingTokens: [p.token0, p.token1],
      poolMeta: '0.3%',
      url: `https://app.soroswap.finance/pools/add-liquidity/${p.token0}/${p.token1}`,
      volumeUsd1d,
    };
  });

  return pools.filter(Boolean).filter(keepFinite).filter((p) => !p.symbol.includes('?'));
};

module.exports = {
  protocolId: '4804',
  timetravel: false,
  apy,
  url: 'https://app.soroswap.finance/pools',
};
