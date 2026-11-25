const sdk = require('@defillama/sdk');

const utils = require('../utils');

const { callSoroban, sorobanRpc, parseScVal } = sdk.chains.stellar;

const FACTORY = 'CC2DWZ5RDSC5BZKEDQ5BABNUATX5EFJ4GCOENDXULEDVBHH2OKXFKYS5';
const LEDGERS_PER_DAY = 17280;
const PRUNE_MARGIN_LEDGERS = 10;
const MIN_TVL_USD = 1e4;

const cursorLedger = (cursor) => Number(BigInt(cursor.split('-')[0]) >> 32n);

const lpFees24h = async (pool, coinCount) => {
  const { latestLedger, oldestLedger } = await sorobanRpc('getHealth');
  const filters = [{ type: 'contract', contractIds: [pool] }];
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const fees = Array(coinCount).fill(0n);
  let cursor;

  // getEvents scans a bounded ledger range per request, so a short page is not the end
  for (;;) {
    const page = await sorobanRpc('getEvents', {
      filters,
      pagination: { limit: 200, cursor },
      startLedger: cursor
        ? undefined
        : Math.max(latestLedger - LEDGERS_PER_DAY, oldestLedger + PRUNE_MARGIN_LEDGERS),
    });
    for (const event of page.events) {
      if (new Date(event.ledgerClosedAt) < since) continue;
      const value = parseScVal(event.value);
      if (value.fees)
        value.fees.forEach((fee, i) => (fees[i] += fee - value.admin_fee_cuts[i]));
      else if (value.fee !== undefined)
        fees[parseScVal(event.topic.at(-1))] += value.fee - value.admin_fee_cut;
    }
    if (!page.cursor || page.cursor === cursor || cursorLedger(page.cursor) >= latestLedger) break;
    cursor = page.cursor;
  }

  return fees;
};

exports.getStellarPools = async () => {
  const poolCount = await callSoroban({ contractId: FACTORY, method: 'pool_count' });
  const pools = [];

  for (let i = 0; i < poolCount; i++) {
    try {
      const { pool, coins, coin_decimals } = await callSoroban({
        contractId: FACTORY,
        method: 'pool_registration',
        args: [i],
      });
      const prices = await utils.getPriceApiCoins(coins.map((coin) => `stellar:${coin}`));
      const priced = coins.map((coin) => prices[`stellar:${coin}`]);
      if (priced.some((coin) => !coin?.price)) continue;

      const toUsd = (amounts) =>
        amounts.reduce(
          (sum, amount, k) => sum + (Number(amount) / 10 ** coin_decimals[k]) * priced[k].price,
          0
        );
      const tvlUsd = toUsd(await callSoroban({ contractId: pool, method: 'get_balances' }));
      if (tvlUsd < MIN_TVL_USD) continue;

      pools.push({
        pool: `${pool}-stellar`,
        chain: utils.formatChain('stellar'),
        project: 'curve-dex',
        symbol: priced.map((coin) => coin.symbol).join('-'),
        tvlUsd,
        apyBase: (toUsd(await lpFees24h(pool, coins.length)) * 365 * 100) / tvlUsd,
        underlyingTokens: coins,
        url: `https://stellar.curve.finance/dex/stellar/pools/${pool}`,
      });
    } catch (error) {
      console.error(`curve-dex: stellar pool ${i} failed`, error?.message);
    }
  }

  return pools;
};
