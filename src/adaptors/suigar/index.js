/**
 * SweetHouse (Suigar) yield adapter for DefiLlama.
 *
 * SweetHouse is the on-chain bankroll behind Suigar, a provably-fair casino
 * on Sui. Its `public_pool` is the only LP-facing, share-priced pool: users
 * deposit and receive `StakedCoin<CoinType>` shares (a Supply<T>, read here
 * as `public_supply`). The pool's value is `balance` (idle liquidity) plus
 * `pipe_debt.value` (liquidity routed to Suilend for lending yield via
 * suigar's `pipe` module). Both house-edge P&L from settled bets and pipe
 * interest flow into this same balance, so price-per-share
 * (poolValue / supply) captures the LP's full realized return with no need
 * to separate the two sources.
 *
 * The private, rakeback and whitelist pools are NOT share-priced vaults
 * (private is the house's own capital, rakeback is a payout pool, whitelist
 * deposits are tracked per-owner outside the StakedCoin supply) and are
 * intentionally excluded here.
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

function pricePerShare(house) {
  if (!house) return null;
  const supply = new BigNumber(house.public_supply?.value ?? 0);
  if (supply.isZero()) return null;
  const value = new BigNumber(house.public_pool.balance).plus(
    house.public_pool.pipe_debt.value
  );
  return value.div(supply);
}

async function getCoinInfos(coinTypes) {
  const response = await fetch(
    utils.getPriceApiUrl(
      `/prices/current/${coinTypes.map((c) => `sui:${c}`).join(',')}`
    )
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

    const poolValue = new BigNumber(house.public_pool.balance).plus(
      house.public_pool.pipe_debt.value
    );
    const tvlUsd = poolValue
      .div(10 ** coinInfo.decimals)
      .times(coinInfo.price)
      .toNumber();

    pools.push({
      pool: objectAddress,
      chain: utils.formatChain('sui'),
      project: PROJECT,
      symbol: coinInfo.symbol,
      poolMeta: 'SweetHouse public pool',
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
