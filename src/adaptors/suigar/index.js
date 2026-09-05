/**
 * SweetHouse (Suigar) yield adapter for DefiLlama.
 *
 * SweetHouse is the on-chain bankroll behind Suigar, a provably-fair casino
 * on Sui. For each supported coin, `tvlUsd` is the full House<CoinType>
 * bankroll — private_pool + public_pool + rakeback_pool + whitelist_pools —
 * matching the methodology of the already-listed Suigar TVL adapter
 * (DefiLlama-Adapters #19811): all of it is protocol-controlled liquidity
 * that backs casino payouts and shares in the same house-edge P&L and pipe
 * (Suilend) interest.
 *
 * Only `public_pool` is LP-facing and share-priced, though: users deposit
 * and receive `StakedCoin<CoinType>` shares (a Supply<T>, read here as
 * `public_supply`). `apyBase` is derived solely from that pool's
 * price-per-share, since it's the only pool with per-depositor accounting
 * — private_pool has no share token and withdrawals are admin-only, and
 * whitelist_pools deposits are tracked per-owner outside the StakedCoin
 * supply. So `apyBase` reflects what an actual LP earns; `tvlUsd` reflects
 * the full bankroll that coin's house-edge economics run on.
 *
 * APY methodology: there is no explicit on-chain accrual rate (unlike a
 * lending market's supply rate), since house-edge P&L lands in lumpy,
 * irregular amounts per bet. So APY is derived from the realized change in
 * price-per-share over a trailing LOOKBACK_DAYS window: read the House
 * object now and again at a historical Sui checkpoint close to
 * `now - LOOKBACK_DAYS`, then annualize the ratio's growth. Comparing a
 * *ratio* rather than raw pool value means deposits/withdrawals in between
 * don't distort the result, only actual P&L does.
 */

const BigNumber = require('bignumber.js');
const utils = require('../utils');

const PROJECT = 'suigar';
const VAULT =
  '0xa1549d73230118716bc08865b8d62454f360ddaf40eee2158e458e52125d4ef1';
const LOOKBACK_DAYS = 7;

const VAULT_DYNAMIC_FIELDS_QUERY = `query ($vault: SuiAddress!, $after: String) {
  object(address: $vault) {
    dynamicFields(first: 50, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        value {
          __typename
          ... on MoveObject { contents { type { repr } json } }
        }
      }
    }
  }
}`;

const HOUSE_OBJECT_QUERY = `query ($address: SuiAddress!, $atCheckpoint: UInt53) {
  object(address: $address, atCheckpoint: $atCheckpoint) {
    asMoveObject { contents { json } }
  }
}`;

const CHECKPOINT_QUERY = `query ($seq: UInt53) {
  checkpoint(sequenceNumber: $seq) { sequenceNumber timestamp }
}`;

const LATEST_CHECKPOINT_QUERY = `query {
  checkpoint { sequenceNumber timestamp }
}`;

// Every House<CoinType> currently backing SweetHouse, as a dynamic field of
// the vault object, alongside game-config registries that live in the same
// vault and are skipped by the ::house::House< type match below.
async function getHouseObjects() {
  const houses = [];
  let after = null;
  do {
    const { object } = await utils.suiGraphql(VAULT_DYNAMIC_FIELDS_QUERY, {
      vault: VAULT,
      after,
    });
    const { pageInfo, nodes } = object.dynamicFields;
    for (const node of nodes) {
      const contents = node.value?.contents;
      const type = contents?.type?.repr;
      const match = type && type.match(/::house::House<(.+)>$/);
      if (match) houses.push({ coinType: match[1], json: contents.json });
    }
    after = pageInfo.hasNextPage ? pageInfo.endCursor : null;
  } while (after);
  return houses;
}

async function getCheckpoint(sequenceNumber) {
  const { checkpoint } = await utils.suiGraphql(CHECKPOINT_QUERY, {
    seq: sequenceNumber,
  });
  return checkpoint;
}

// Estimate + refine the checkpoint closest to `targetMs` via linear
// interpolation. Sui's checkpoint cadence is near-constant over a
// multi-day window, so a calibration read plus one correction pass
// converges to within minutes — precise enough for a 7-day APY window.
async function findCheckpointNear(targetMs) {
  const { checkpoint: latest } = await utils.suiGraphql(
    LATEST_CHECKPOINT_QUERY,
    {}
  );
  const latestSeq = latest.sequenceNumber;
  const latestMs = Date.parse(latest.timestamp);

  const calibrationSeq = Math.max(1, latestSeq - 1_000_000);
  const calibration = await getCheckpoint(calibrationSeq);
  const calibrationMs = Date.parse(calibration.timestamp);

  const msPerCheckpoint =
    (latestMs - calibrationMs) / (latestSeq - calibrationSeq);
  if (!(msPerCheckpoint > 0)) return latest;

  const clamp = (seq) => Math.min(Math.max(Math.round(seq), 1), latestSeq);

  let estimateSeq = clamp(latestSeq - (latestMs - targetMs) / msPerCheckpoint);
  let estimate = await getCheckpoint(estimateSeq);
  const estimateMs = Date.parse(estimate.timestamp);

  const correctionSeq = clamp(
    estimateSeq - (estimateMs - targetMs) / msPerCheckpoint
  );
  if (correctionSeq !== estimateSeq) estimate = await getCheckpoint(correctionSeq);

  return estimate;
}

async function readHouseAt(objectAddress, atCheckpoint) {
  const { object } = await utils.suiGraphql(HOUSE_OBJECT_QUERY, {
    address: objectAddress,
    atCheckpoint,
  });
  return object?.asMoveObject?.contents?.json ?? null;
}

function poolValue(pool) {
  return new BigNumber(pool.balance).plus(pool.pipe_debt.value);
}

function pricePerShare(house) {
  if (!house) return null;
  const supply = new BigNumber(house.public_supply?.value ?? 0);
  if (supply.isZero()) return null;
  return poolValue(house.public_pool).div(supply);
}

// Full bankroll for this coin: private + public + rakeback + whitelist,
// matching the methodology of the already-listed Suigar TVL adapter.
function totalHouseValue(house) {
  let total = poolValue(house.private_pool)
    .plus(poolValue(house.public_pool))
    .plus(poolValue(house.rakeback_pool));
  for (const pool of house.whitelist_pools ?? []) total = total.plus(poolValue(pool));
  return total;
}

async function getCoinInfos(coinTypes) {
  const response = await fetch(
    utils.getPriceApiUrl(
      `/prices/current/${coinTypes.map((c) => `sui:${c}`).join(',')}`
    ),
    { signal: AbortSignal.timeout(30_000) }
  );
  const json = await response.json();
  return coinTypes.map((coinType) => json.coins[`sui:${coinType}`]);
}

const getApyData = async () => {
  const [houses, targetCheckpoint] = await Promise.all([
    getHouseObjects(),
    findCheckpointNear(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000),
  ]);
  const coinInfos = await getCoinInfos(houses.map((h) => h.coinType));

  const pools = [];
  for (let i = 0; i < houses.length; i++) {
    const { coinType, json: house } = houses[i];
    const coinInfo = coinInfos[i];
    if (!coinInfo) continue;

    const objectAddress = house.id.id ?? house.id;
    const [nowPPS, thenHouse] = await Promise.all([
      pricePerShare(house),
      readHouseAt(objectAddress, targetCheckpoint.sequenceNumber),
    ]);
    const thenPPS = pricePerShare(thenHouse);

    let apy = 0;
    if (nowPPS && thenPPS && thenPPS.gt(0)) {
      const growth = nowPPS.div(thenPPS).minus(1);
      const elapsedDays =
        (Date.now() - Date.parse(targetCheckpoint.timestamp)) /
        (24 * 60 * 60 * 1000);
      if (elapsedDays > 0) {
        const apr = growth.times(365 / elapsedDays).times(100).toNumber();
        apy = utils.aprToApy(apr);
      }
    }

    const tvlUsd = totalHouseValue(house)
      .div(10 ** coinInfo.decimals)
      .times(coinInfo.price)
      .toNumber();

    pools.push({
      pool: objectAddress,
      chain: utils.formatChain('sui'),
      project: PROJECT,
      symbol: coinInfo.symbol,
      poolMeta: 'SweetHouse bankroll (public pool APY)',
      apyBase: apy,
      tvlUsd,
      underlyingTokens: [coinType],
    });
  }

  return pools;
};

module.exports = {
  protocolId: '8101',
  timetravel: false,
  apy: getApyData,
  url: 'https://house.suigar.com',
};
