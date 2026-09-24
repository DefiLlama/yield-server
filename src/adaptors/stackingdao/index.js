const axios = require('axios');
const { hexToCV, cvToValue } = require('@stacks/transactions');
const { getPriceApiUrl, withRetry } = require('../utils');

const HIRO = 'https://api.hiro.so';
const DEPLOYER = 'SP4SZE494VC2YC5JYG7AYFQ44F5Q4PYV7DVMDPBG';
const CHAIN = 'Stacks';
const URL = 'https://app.stackingdao.com';

const CONTRACTS = {
  ststxToken: `${DEPLOYER}.ststx-token`,
  ststxbtcTokenV1: `${DEPLOYER}.ststxbtc-token`,
  ststxbtcTokenV2: `${DEPLOYER}.ststxbtc-token-v2`,
  stbtcToken: `${DEPLOYER}.stbtc-token`,
  dataStx: `${DEPLOYER}.data-stx-v2`,
  dataStbtc: `${DEPLOYER}.data-stbtc-v1`,
  rewards: `${DEPLOYER}.rewards-pox5-v1`,
  poolData: `${DEPLOYER}.data-pools-stbtc-v1`,
};

// The claim scan list. SIGNERS only covers the public roster; the bond
// managers stake through bond events, also claim, and the contract's split
// bps are shares of EVERYTHING that lands in the rewards contract — leaving
// their claims out under-reports both LSTs (protocol sees ~a quarter more
// pot since the bond era began).
const SIGNER_MANAGERS = [
  'stacking-dao',
  'juicy-stake',
  'xverse',
  'infstones',
  'hashkey',
  'foundry',
  'blockdaemon',
].map((slug) => `${DEPLOYER}.signer-manager-${slug}-v1`);

// pox-5 bond periods overlap six at a time; one signer manager per slot.
const BOND_MANAGERS = Array.from(
  { length: 6 },
  (_, i) => `${DEPLOYER}.signer-manager-bond-${i + 1}-v2`
);

const ALL_MANAGERS = [...SIGNER_MANAGERS, ...BOND_MANAGERS];

const CYCLES_PER_YEAR = 25;
// pox-5 computes a cycle's rewards twice: at the half-cycle and at the end.
const DISTRIBUTIONS_PER_CYCLE = 2;
// Start of the stBTC reward stream: the first real process-rewards payment
// (burn block 967405). Before it the reserve was paid 1 satoshi a round, so
// the APY is the ratio growth since this point, annualized. The ratio is read
// at that block, so the first catch-up payment is already in it.
const STBTC_REWARDS_START = {
  timestampMs: Date.parse('2026-09-17T11:52:22Z'),
  ratio: 1.00117674,
};
const MS_PER_YEAR = 365 * 86_400_000;
const STBTC_MIN_SUPPLY = 0.001;
const TXS_PER_PAGE = 50;
const MAX_TX_PAGES = 4;

const RETRY = { retries: 3, delayMs: 8000 };
const HTTP = { timeout: 30000 };

const toNum = (cv) => {
  const v = cvToValue(cv);
  if (typeof v === 'object' && v !== null && 'value' in v) return Number(v.value);
  return Number(v);
};

const readOnly = async (contract, fn, tip) => {
  const [address, name] = contract.split('.');
  const url = `${HIRO}/v2/contracts/call-read/${address}/${name}/${fn}${tip ? `?tip=${tip.replace(/^0x/, '')}` : ''}`;
  const { data } = await withRetry(() => axios.post(url, { sender: DEPLOYER, arguments: [] }, HTTP), RETRY);
  if (!data.okay) throw new Error(`${contract}.${fn} failed: ${data.cause}`);
  return toNum(hexToCV(data.result));
};

const getJson = async (path) => (await withRetry(() => axios.get(`${HIRO}${path}`, HTTP), RETRY)).data;

const fetchPrices = async () => {
  const { data } = await withRetry(
    () => axios.get(getPriceApiUrl('/prices/current/coingecko:blockstack,coingecko:bitcoin'), HTTP),
    RETRY
  );
  return {
    stx: data.coins['coingecko:blockstack'].price,
    btc: data.coins['coingecko:bitcoin'].price,
  };
};

const fetchManagerClaims = async (manager) => {
  const rows = [];
  for (let page = 0; page < MAX_TX_PAGES; page++) {
    const data = await getJson(
      `/extended/v2/addresses/${manager}/transactions?limit=${TXS_PER_PAGE}&offset=${page * TXS_PER_PAGE}`
    );
    const results = data.results || [];
    rows.push(...results.map((row) => row.tx || row));
    if (results.length < TXS_PER_PAGE) break;
  }
  return rows
    .filter(
      (tx) =>
        tx.tx_type === 'contract_call' &&
        tx.tx_status === 'success' &&
        tx.contract_call?.function_name === 'claim-rewards'
    )
    .map((tx) => ({
      txId: tx.tx_id,
      burnHeight: tx.burn_block_height,
      cycleId: Number(tx.contract_call.function_args?.[1]?.repr.replace(/^u/, '')),
    }))
    .filter((claim) => Number.isFinite(claim.cycleId));
};

const claimedSats = async (txId) => {
  const data = await getJson(`/extended/v1/tx/${txId}?event_limit=100`);
  return (data.events || []).reduce((sum, event) => {
    const asset = event.asset;
    if (event.event_type !== 'fungible_token_asset' || !asset) return sum;
    if (!asset.asset_id.toLowerCase().includes('sbtc-token')) return sum;
    if (asset.recipient !== CONTRACTS.rewards) return sum;
    return sum + Number(asset.amount);
  }, 0);
};

// How many of a cycle's two pox-5 distributions a claim batch covers.
// Distribution k of a cycle is computed at cycleStart + k * (cycleLength / 2)
// and claimed shortly after, and pox-5 accumulates unclaimed rewards within
// the cycle, so the batch covers the HIGHEST distribution any claim reached.
const coveredDistributions = (cycleId, claimBurnHeights, pox) => {
  const cycleStart = pox.first_burnchain_block_height + cycleId * pox.reward_cycle_length;
  const interval = pox.reward_cycle_length / DISTRIBUTIONS_PER_CYCLE;
  return claimBurnHeights.reduce((acc, height) => {
    const index = Math.floor((height - cycleStart) / interval);
    if (index < 1) return acc;
    return Math.max(acc, Math.min(index, DISTRIBUTIONS_PER_CYCLE));
  }, 0);
};

const fetchLatestClaimBatch = async (pox) => {
  const claims = [];
  for (const manager of ALL_MANAGERS) {
    claims.push(...(await fetchManagerClaims(manager)));
  }
  // Newest cycle first; the first one with a usable reward batch wins. A
  // zero-sat or pre-distribution batch on the newest cycle must not suppress
  // both LST pools while an older usable cycle exists.
  const cycleIds = [...new Set(claims.map((c) => c.cycleId))].sort((a, b) => b - a);
  for (const cycleId of cycleIds) {
    const batch = claims.filter((c) => c.cycleId === cycleId);
    let grossSats = 0;
    // Burn heights of the claims that actually moved sBTC; they tell which of
    // the cycle's distributions the batch covers.
    const claimBurnHeights = [];
    for (const claim of batch) {
      const sats = await claimedSats(claim.txId);
      if (sats > 0) claimBurnHeights.push(claim.burnHeight);
      grossSats += sats;
    }
    const covered = coveredDistributions(cycleId, claimBurnHeights, pox);
    if (grossSats > 0 && covered > 0) {
      return { cycleId, grossSats, claimBurnHeights, covered };
    }
  }
  return null;
};

const fetchLstApys = async (prices) => {
  const pox = await getJson('/v2/pox');
  const [batch, commissionBps, ststxbtcBps, ststxBps, supplyBtcV1, supplyBtcV2, supplyStstx, liveEscrow, ratio] =
    await Promise.all([
      fetchLatestClaimBatch(pox),
      readOnly(CONTRACTS.poolData, 'get-pool-commission'),
      readOnly(CONTRACTS.rewards, 'get-ststxbtc-bps'),
      readOnly(CONTRACTS.rewards, 'get-ststx-bps'),
      readOnly(CONTRACTS.ststxbtcTokenV1, 'get-total-supply'),
      readOnly(CONTRACTS.ststxbtcTokenV2, 'get-total-supply'),
      readOnly(CONTRACTS.ststxToken, 'get-total-supply'),
      readOnly(CONTRACTS.dataStx, 'get-live-escrow'),
      readOnly(CONTRACTS.dataStx, 'get-stx-per-ststx'),
    ]);

  const ststxbtcStx = (supplyBtcV1 + supplyBtcV2) / 1e6;
  // APY denominator follows the protocol's own arithmetic (total supply times
  // the exchange rate); TVL uses the active supply. stSTXbtc is non-rebasing,
  // so 1 stSTXbtc is 1 STX.
  const ststxStx = (supplyStstx / 1e6) * (ratio / 1e6);
  const tvlStstxStx = (Math.max(supplyStstx - liveEscrow, 0) / 1e6) * (ratio / 1e6);
  const result = {
    ststxStx,
    tvlStstxStx,
    ststxbtcStx,
    pricePerShareStstx: ratio / 1e6,
    ststx: null,
    ststxbtc: null,
  };
  if (!batch || ststxStx <= 0 || ststxbtcStx <= 0) return result;

  // pox-5 pays a cycle in discrete distributions (two: at the half-cycle and
  // at the end), not continuously, so a partial cycle is projected by how
  // many of them the batch covers. Projecting off reward-phase progress
  // instead freezes the multiplier once claims stop landing (a finished cycle
  // would stay scaled up for days).
  const multiplier = DISTRIBUTIONS_PER_CYCLE / batch.covered;
  const netPerCycle = batch.grossSats * multiplier * (1 - commissionBps / 1e4);
  const annualBtc = (netPerCycle * CYCLES_PER_YEAR) / 1e8;
  const apy = (bps, poolStx) => (((annualBtc * bps) / 1e4) * prices.btc) / (poolStx * prices.stx) * 100;
  const compound = (simple) => (Math.pow(1 + simple / 100 / CYCLES_PER_YEAR, CYCLES_PER_YEAR) - 1) * 100;

  result.ststxbtc = apy(ststxbtcBps, ststxbtcStx);
  result.ststx = compound(apy(ststxBps, ststxStx));
  return result;
};

const fetchStbtc = async (prices) => {
  const [ratioRaw, supplyNow, pendingShares, readySats, ststxbtcBps, ststxBps] = await Promise.all([
    readOnly(CONTRACTS.dataStbtc, 'get-sbtc-per-stbtc'),
    readOnly(CONTRACTS.stbtcToken, 'get-total-supply'),
    readOnly(CONTRACTS.dataStbtc, 'get-pending-shares'),
    readOnly(CONTRACTS.rewards, 'get-ready-to-release'),
    readOnly(CONTRACTS.rewards, 'get-ststxbtc-bps'),
    readOnly(CONTRACTS.rewards, 'get-ststx-bps'),
  ]);
  const ratio = ratioRaw / 1e8;
  const supply = Math.max(supplyNow - pendingShares, 0) / 1e8;
  const result = { tvlUsd: supply * ratio * prices.btc, apy: null, pricePerShare: ratio };
  if (supply < STBTC_MIN_SUPPLY) return result;

  // stBTC is a ratio-growth vault. Between releases the on-chain ratio lags
  // what holders have actually earned, so add stBTC's share of the rewards
  // accrued on the stream but not yet released (its share of every release is
  // what the two STX LSTs leave: the contract's remainder). The APY is then
  // the compound growth from the start of the reward stream, annualized —
  // the same source as the protocol's own stats, unlike a trailing window,
  // which read ~51% low. get-sbtc-per-stbtc divides active backing by
  // total supply minus pending shares, so the accrued addition uses the same
  // active-share denominator. get-ready-to-release is a scheduled amount; the
  // contract takes commission on newly claimed rewards, not here.
  const activeShares = Math.max(supplyNow - pendingShares, 0);
  const shareBps = Math.max(0, 1e4 - ststxbtcBps - ststxBps);
  const effective =
    readySats > 0 && shareBps > 0 && activeShares > 0
      ? ratio + (readySats * shareBps) / 1e4 / activeShares
      : ratio;
  const elapsedMs = Date.now() - STBTC_REWARDS_START.timestampMs;
  if (elapsedMs <= 0 || effective <= 0) return result;
  const apy = (Math.pow(effective / STBTC_REWARDS_START.ratio, MS_PER_YEAR / elapsedMs) - 1) * 100;
  if (Number.isFinite(apy) && apy > 0 && apy < 100) result.apy = apy;
  return result;
};

const apy = async () => {
  const prices = await fetchPrices();
  const empty = { ststx: null, ststxbtc: null };
  const [lst, stbtc] = await Promise.all([
    fetchLstApys(prices).catch((error) => {
      console.log(`stackingdao: LST read failed: ${error.message}`);
      return empty;
    }),
    fetchStbtc(prices).catch((error) => {
      console.log(`stackingdao: stBTC read failed: ${error.message}`);
      return { apy: null };
    }),
  ]);

  const pools = [];
  if (lst.ststx !== null) {
    pools.push({
      pool: `${CONTRACTS.ststxToken}-stackingdao-${CHAIN}`.toLowerCase(),
      chain: CHAIN,
      project: 'stackingdao',
      symbol: 'stSTX',
      tvlUsd: lst.tvlStstxStx * prices.stx,
      apyBase: lst.ststx,
      isIntrinsicSource: true,
      pricePerShare: lst.pricePerShareStstx,
      underlyingTokens: ['coingecko:blockstack'],
      token: CONTRACTS.ststxToken,
      url: `${URL}/stack`,
    });
  }
  if (lst.ststxbtc !== null) {
    pools.push({
      pool: `${CONTRACTS.ststxbtcTokenV2}-stackingdao-${CHAIN}`.toLowerCase(),
      chain: CHAIN,
      project: 'stackingdao',
      symbol: 'stSTXbtc',
      tvlUsd: lst.ststxbtcStx * prices.stx,
      apyBase: lst.ststxbtc,
      isIntrinsicSource: true,
      // non-rebasing: 1 stSTXbtc redeems for 1 STX
      pricePerShare: 1,
      underlyingTokens: ['coingecko:blockstack'],
      token: CONTRACTS.ststxbtcTokenV2,
      url: `${URL}/stack`,
    });
  }
  if (stbtc.apy !== null) {
    pools.push({
      pool: `${CONTRACTS.stbtcToken}-stackingdao-${CHAIN}`.toLowerCase(),
      chain: CHAIN,
      project: 'stackingdao',
      symbol: 'stBTC',
      tvlUsd: stbtc.tvlUsd,
      apyBase: stbtc.apy,
      isIntrinsicSource: true,
      pricePerShare: stbtc.pricePerShare,
      underlyingTokens: ['SM3VDXK3WZZSA84XXFKAFAF15NNZX32CTSG82JFQ4.sbtc-token'],
      token: CONTRACTS.stbtcToken,
      url: `${URL}/stack`,
    });
  }
  return pools;
};

module.exports = {
  protocolId: '3934',
  timetravel: false,
  apy,
  url: URL,
};
