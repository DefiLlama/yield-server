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

const SIGNER_MANAGERS = [
  'stacking-dao',
  'juicy-stake',
  'xverse',
  'infstones',
  'hashkey',
  'foundry',
  'blockdaemon',
].map((slug) => `${DEPLOYER}.signer-manager-${slug}-v1`);

const CYCLES_PER_YEAR = 25;
const REWARD_PHASE_PAYOUT_FRACTION = 0.95;
const BURN_BLOCKS_PER_DAY = 144;
const STBTC_WINDOWS_DAYS = [30, 14, 7];
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

const fetchLatestClaimBatch = async () => {
  const claims = [];
  for (const manager of SIGNER_MANAGERS) {
    claims.push(...(await fetchManagerClaims(manager)));
  }
  if (!claims.length) return null;
  const cycleId = Math.max(...claims.map((c) => c.cycleId));
  const batch = claims.filter((c) => c.cycleId === cycleId);
  let grossSats = 0;
  for (const claim of batch) grossSats += await claimedSats(claim.txId);
  return {
    cycleId,
    grossSats,
    burnHeight: Math.max(...batch.map((c) => c.burnHeight)),
  };
};

const fetchLstApys = async (prices) => {
  const [batch, pox, commissionBps, ststxbtcBps, ststxBps, supplyBtcV1, supplyBtcV2, supplyStstx, liveEscrow, ratio] =
    await Promise.all([
      fetchLatestClaimBatch(),
      getJson('/v2/pox'),
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
  const ststxStx = (Math.max(supplyStstx - liveEscrow, 0) / 1e6) * (ratio / 1e6);
  const result = { ststxStx, ststxbtcStx, ststx: null, ststxbtc: null };
  if (!batch || batch.grossSats <= 0 || ststxStx <= 0 || ststxbtcStx <= 0) return result;

  const cycleStart = pox.first_burnchain_block_height + batch.cycleId * pox.reward_cycle_length;
  const elapsed = Math.min(Math.max(batch.burnHeight - cycleStart, 0), pox.reward_phase_block_length);
  const progress = elapsed / pox.reward_phase_block_length;
  if (progress <= 0) return result;

  const multiplier = Math.max(REWARD_PHASE_PAYOUT_FRACTION / progress, 1);
  const netPerCycle = batch.grossSats * multiplier * (1 - commissionBps / 1e4);
  const annualBtc = (netPerCycle * CYCLES_PER_YEAR) / 1e8;
  const apy = (bps, poolStx) => (((annualBtc * bps) / 1e4) * prices.btc) / (poolStx * prices.stx) * 100;
  const compound = (simple) => (Math.pow(1 + simple / 100 / CYCLES_PER_YEAR, CYCLES_PER_YEAR) - 1) * 100;

  result.ststxbtc = apy(ststxbtcBps, ststxbtcStx);
  result.ststx = compound(apy(ststxBps, ststxStx));
  return result;
};

const resolveTipAtBurnHeight = async (burnHeight) => {
  for (let offset = 0; offset <= 10; offset++) {
    const candidates = offset === 0 ? [burnHeight] : [burnHeight + offset, burnHeight - offset];
    for (const h of candidates) {
      const data = await getJson(`/extended/v2/burn-blocks/${h}/blocks?limit=1`).catch((error) => {
        if (error.response?.status === 404) return null;
        throw error;
      });
      const block = data?.results?.[0];
      if (block?.index_block_hash) return block.index_block_hash;
    }
  }
  return null;
};

const fetchStbtc = async (prices) => {
  const [pox, ratioNow, supplyNow, pendingShares] = await Promise.all([
    getJson('/v2/pox'),
    readOnly(CONTRACTS.dataStbtc, 'get-sbtc-per-stbtc'),
    readOnly(CONTRACTS.stbtcToken, 'get-total-supply'),
    readOnly(CONTRACTS.dataStbtc, 'get-pending-shares'),
  ]);
  const ratio = ratioNow / 1e8;
  const supply = Math.max(supplyNow - pendingShares, 0) / 1e8;
  const result = { tvlUsd: supply * ratio * prices.btc, apy: null };
  if (supply < STBTC_MIN_SUPPLY) return result;

  for (const days of STBTC_WINDOWS_DAYS) {
    const tip = await resolveTipAtBurnHeight(pox.current_burnchain_block_height - days * BURN_BLOCKS_PER_DAY);
    if (!tip) continue;
    const [ratioPast, supplyPast] = await Promise.all([
      readOnly(CONTRACTS.dataStbtc, 'get-sbtc-per-stbtc', tip).catch(() => null),
      readOnly(CONTRACTS.stbtcToken, 'get-total-supply', tip).catch(() => null),
    ]);
    if (!ratioPast || ratioPast <= 0 || ratioNow <= ratioPast) continue;
    if (!supplyPast || supplyPast / 1e8 < STBTC_MIN_SUPPLY) continue;
    const apy = (Math.pow(ratioNow / ratioPast, 365 / days) - 1) * 100;
    if (Number.isFinite(apy) && apy > 0 && apy < 100) {
      result.apy = apy;
      break;
    }
  }
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
      tvlUsd: lst.ststxStx * prices.stx,
      apyBase: lst.ststx,
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
