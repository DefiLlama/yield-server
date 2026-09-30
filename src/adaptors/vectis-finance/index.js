const crypto = require('crypto');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SOL_RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';

// Which vaults to list, and their names and pages. Every number is read from
// the chain below, and each vault is checked on-chain before it is listed, so
// this list only decides what is shown, not what it reports.
const VAULTS_URL = 'https://api.vectis.finance/strategy/defillama-yield-vaults';

// APY is the growth of the post-fee share price over the last WINDOW_DAYS, or
// since the vault's start date (served with the vault list) if it is younger.
// NAV is pushed on-chain about once a day, so a 24h window would straddle zero
// or two updates. The start date matters: a vault's first on-chain price can
// predate its launch (the Ethereum vault read 34.58, a mispricing corrected
// before its 2026-09-03 start at 1.0188). A vault with less than
// MIN_HISTORY_DAYS since its start is left out, as a few days annualised says
// little.
const WINDOW_DAYS = 30;
const MIN_HISTORY_DAYS = 7;
const DAY = 86400;

// A strategy rebalance runs as several transactions over an hour or two, and
// the share price is off by a few percent between them (-4.2% for ~1.5h, and
// in one case +13% for a minute). Only a state that stood for STABLE_SECONDS
// is used as either end of the window, and "now" is read SETTLE_SECONDS back
// so a rebalance in progress has finished.
const SETTLE_SECONDS = 6 * 3600;
const STABLE_SECONDS = 3 * 3600;
const MAX_TX_FETCHES_PER_POINT = 40;

// ---------------------------------------------------------------------------
// Solana (Voltr)
// ---------------------------------------------------------------------------

const VOLTR_PROGRAM = 'vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

const base58Encode = (bytes) => {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8;
      digits[i] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
};

const rpc = async (method, params) => {
  const { result, error } = await utils.withRetry(
    () => utils.getData(SOL_RPC, { jsonrpc: '2.0', id: 1, method, params }),
    { retries: 5, delayMs: 1000 }
  );
  if (error) throw new Error(`Solana RPC ${method}: ${error.message}`);
  return result;
};

const getAccounts = async (addresses) =>
  (await rpc('getMultipleAccounts', [addresses, { encoding: 'base64' }])).value;

// Anchor prefixes each account and event with sha256("<kind>:<Name>")[0..8].
const discriminator = (kind, name) =>
  crypto.createHash('sha256').update(`${kind}:${name}`).digest().subarray(0, 8);

const VAULT_DISCRIMINATOR = discriminator('account', 'Vault');

// Every Voltr event that changes a vault's total value or LP supply carries
// both after the instruction, so the post-fee share price after any such
// transaction can be read straight from its log. "LP supply incl fees" counts
// accrued-but-unminted fee LP, so the price is net of performance and
// management fees. Offsets are from the voltr_vault IDL (8-byte discriminator,
// then borsh fields).
const VOLTR_EVENTS = [
  { name: 'DepositVaultEvent', vault: 56, totalValue: 128, lpSupply: 144 },
  { name: 'WithdrawVaultEvent', vault: 56, totalValue: 136, lpSupply: 152 },
  { name: 'DepositStrategyEvent', vault: 40, totalValue: 216, lpSupply: 232 },
  { name: 'WithdrawStrategyEvent', vault: 40, totalValue: 216, lpSupply: 232 },
  {
    name: 'DirectWithdrawStrategyEvent',
    vault: 56,
    totalValue: 264,
    lpSupply: 280,
  },
].map((e) => ({ ...e, discriminator: discriminator('event', e.name) }));

// Vault account (voltr_vault IDL): asset.mint at 104, lp.mint at 272.
const VAULT_ASSET_MINT_OFFSET = 104;
const VAULT_LP_MINT_OFFSET = 272;
const MINT_DECIMALS_OFFSET = 44;

const decodeVaultStates = (logMessages, vault) => {
  const states = [];
  for (const line of logMessages ?? []) {
    if (!line.startsWith('Program data: ')) continue;
    const data = Buffer.from(line.slice('Program data: '.length), 'base64');
    const event = VOLTR_EVENTS.find((e) =>
      data.subarray(0, 8).equals(e.discriminator)
    );
    if (!event || data.length < event.lpSupply + 8) continue;
    if (base58Encode(data.subarray(event.vault, event.vault + 32)) !== vault)
      continue;
    states.push({
      event: event.name,
      totalValue: data.readBigUInt64LE(event.totalValue),
      lpSupply: data.readBigUInt64LE(event.lpSupply),
    });
  }
  return states;
};

// Signatures touching the vault, newest first, back to `since`.
const getSignaturesSince = async (address, since) => {
  const signatures = [];
  let before;
  for (;;) {
    const page = await rpc('getSignaturesForAddress', [
      address,
      { limit: 1000, before, commitment: 'confirmed' },
    ]);
    signatures.push(...page.filter((s) => !s.err && s.blockTime));
    if (page.length < 1000 || page[page.length - 1].blockTime < since)
      return signatures;
    before = page[page.length - 1].signature;
  }
};

// Vault state after each transaction, fetched lazily and cached, since only
// the few transactions around each end of the window are ever read.
const makeStateReader = (vault, decimals) => {
  const cache = new Map();
  let fetches = 0;
  return async (signature) => {
    if (cache.has(signature.signature)) return cache.get(signature.signature);
    if (++fetches > MAX_TX_FETCHES_PER_POINT * 3)
      throw new Error(`Too many transactions read for vault ${vault}`);
    const tx = await rpc('getTransaction', [
      signature.signature,
      { maxSupportedTransactionVersion: 0, commitment: 'confirmed' },
    ]);
    const last = decodeVaultStates(tx?.meta?.logMessages, vault).pop();
    const state = last && {
      blockTime: signature.blockTime,
      signature: signature.signature,
      event: last.event,
      totalValue: Number(last.totalValue) / 10 ** decimals.asset,
      pricePerShare:
        Number(last.totalValue) /
        10 ** decimals.asset /
        (Number(last.lpSupply) / 10 ** decimals.lp),
    };
    cache.set(signature.signature, state);
    return state;
  };
};

// The vault state in force at `timestamp`: the latest one at or before it that
// stood for at least STABLE_SECONDS before the next one replaced it. A vault
// with no state that old (its history starts after `timestamp`) is measured
// from its first state that stood as long instead. Null if there is none.
const stableStateAt = async (signatures, readState, timestamp) => {
  const older = signatures.filter((s) => s.blockTime <= timestamp);
  const newer = signatures.filter((s) => s.blockTime > timestamp).reverse();

  let reads = 0;
  const read = (s) => {
    if (++reads > MAX_TX_FETCHES_PER_POINT)
      throw new Error('No stable vault state found near the window boundary');
    return readState(s);
  };
  const stood = (state, next) =>
    !next || next.blockTime - state.blockTime >= STABLE_SECONDS;

  // States after `timestamp`, oldest first, read only as far as needed.
  const after = [];
  const stateAfter = async (i) => {
    while (after.length <= i && newer.length) {
      const state = await read(newer.shift());
      if (state) after.push(state);
    }
    return after[i] ?? null;
  };

  let successor = await stateAfter(0);
  let olderStates = 0;
  for (const s of older) {
    const state = await read(s);
    if (!state) continue;
    olderStates++;
    if (stood(state, successor)) return state;
    successor = state;
  }
  if (olderStates) return null;

  for (let i = 0; ; i++) {
    const state = await stateAfter(i);
    if (!state) return null;
    if (stood(state, await stateAfter(i + 1))) return state;
  }
};

// Start of the APY window: WINDOW_DAYS before `end`, or the vault's start date
// if that is later.
const windowStart = (end, startDate) =>
  Math.max(
    end - WINDOW_DAYS * DAY,
    Math.floor(Date.parse(startDate) / 1000) || 0
  );

const annualise = (pricePerShareNow, pricePerShareThen, seconds) =>
  ((pricePerShareNow / pricePerShareThen) ** ((365 * DAY) / seconds) - 1) * 100;

const getVoltrVault = async ({ address, startDate }) => {
  const [account] = await getAccounts([address]);
  const data = account && Buffer.from(account.data[0], 'base64');
  if (
    account?.owner !== VOLTR_PROGRAM ||
    !data.subarray(0, 8).equals(VAULT_DISCRIMINATOR)
  )
    throw new Error(`${address} is not a Voltr vault`);
  const asset = base58Encode(
    data.subarray(VAULT_ASSET_MINT_OFFSET, VAULT_ASSET_MINT_OFFSET + 32)
  );
  const lpMint = base58Encode(
    data.subarray(VAULT_LP_MINT_OFFSET, VAULT_LP_MINT_OFFSET + 32)
  );

  const [assetDecimals, lpDecimals] = (await getAccounts([asset, lpMint])).map(
    (m) => Buffer.from(m.data[0], 'base64')[MINT_DECIMALS_OFFSET]
  );
  const decimals = { asset: assetDecimals, lp: lpDecimals };

  const end = Math.floor(Date.now() / 1000) - SETTLE_SECONDS;
  const start = windowStart(end, startDate);
  if (end - start < MIN_HISTORY_DAYS * DAY) return null;

  // One extra day, to reach back past a rebalance at the window start.
  const signatures = await getSignaturesSince(address, start - DAY);
  const readState = makeStateReader(address, decimals);

  const now = await stableStateAt(signatures, readState, end);
  const then = await stableStateAt(signatures, readState, start);
  if (!now || !then) return null;
  const elapsed = now.blockTime - then.blockTime;
  if (elapsed < MIN_HISTORY_DAYS * DAY) return null;

  return {
    asset,
    assets: now.totalValue,
    pricePerShare: now.pricePerShare,
    apyBase: annualise(now.pricePerShare, then.pricePerShare, elapsed),
    token: lpMint,
  };
};

// ---------------------------------------------------------------------------
// EVM (Accountable ERC-4626)
// ---------------------------------------------------------------------------

const CONVERT_TO_ASSETS =
  'function convertToAssets(uint256 shares) view returns (uint256)';

// convertToAssets on these vaults is the NAV-based post-fee price: Accountable
// takes its fees by minting shares, so the dilution is already in it.
const getErc4626Vault = async ({ address: target, chain, startDate }) => {
  const call = (abi, { block, params, target: t = target } = {}) =>
    sdk.api.abi
      .call({ target: t, abi, params, block, chain })
      .then((r) => r.output);

  const asset = await call('address:asset');
  const [shareDecimals, assetDecimals] = (
    await Promise.all([
      call('erc20:decimals'),
      call('erc20:decimals', { target: asset }),
    ])
  ).map(Number);
  const oneShare = (10n ** BigInt(shareDecimals)).toString();

  const end = Math.floor(Date.now() / 1000);
  const start = windowStart(end, startDate);
  if (end - start < MIN_HISTORY_DAYS * DAY) return null;

  // The block API returns each block's own timestamp too, which is what the
  // window is annualised over.
  const [blockNow, blockThen] = await Promise.all(
    [end, start].map((t) => utils.getPriceApiData(`/block/${chain}/${t}`))
  );

  const [supplyNow, supplyThen] = await Promise.all([
    call('erc20:totalSupply', { block: blockNow.height }),
    call('erc20:totalSupply', { block: blockThen.height }),
  ]);
  // Before the first deposit the vault reports a 1:1 placeholder price.
  if (!(Number(supplyThen) > 0)) return null;

  const [assetsNow, pricePerShareNow, pricePerShareThen] = await Promise.all([
    call(CONVERT_TO_ASSETS, { block: blockNow.height, params: [supplyNow] }),
    call(CONVERT_TO_ASSETS, { block: blockNow.height, params: [oneShare] }),
    call(CONVERT_TO_ASSETS, { block: blockThen.height, params: [oneShare] }),
  ]);

  return {
    asset,
    assets: Number(assetsNow) / 10 ** assetDecimals,
    pricePerShare: Number(pricePerShareNow) / 10 ** assetDecimals,
    apyBase: annualise(
      Number(pricePerShareNow),
      Number(pricePerShareThen),
      blockNow.timestamp - blockThen.timestamp
    ),
    token: target.toLowerCase(),
  };
};

// ---------------------------------------------------------------------------

const READERS = {
  voltr: (vault) => vault.chain === 'solana' && getVoltrVault(vault),
  erc4626: (vault) => vault.address.startsWith('0x') && getErc4626Vault(vault),
};

const apy = async () => {
  const { data: vaults } = await utils.getData(VAULTS_URL);

  // Sequential: the public Solana RPC rate-limits parallel transaction reads.
  // One vault failing is logged and skipped, so it cannot take the others
  // off the page with it.
  const read = [];
  for (const vault of vaults) {
    try {
      const data = await READERS[vault.type]?.(vault);
      if (data) read.push({ vault, data });
      else console.log(`vectis-finance: skipped ${vault.name}, no data`);
    } catch (e) {
      console.error(`vectis-finance: ${vault.name} failed: ${e.message}`);
    }
  }

  const keys = [
    ...new Set(read.map((r) => `${r.vault.chain}:${r.data.asset}`)),
  ];
  const { coins } = keys.length
    ? await utils.getPriceApiData(`/prices/current/${keys.join(',')}`)
    : { coins: {} };

  return read
    .map(({ vault, data }) => {
      const coin = coins[`${vault.chain}:${data.asset}`];
      if (!coin) return null;
      return {
        pool:
          vault.chain === 'solana'
            ? `${vault.address}-solana`
            : `${vault.address}-${vault.chain}`.toLowerCase(),
        chain: utils.formatChain(vault.chain),
        project: 'vectis-finance',
        symbol: utils.formatSymbol(coin.symbol),
        tvlUsd: data.assets * coin.price,
        apyBase: data.apyBase,
        pricePerShare: data.pricePerShare,
        underlyingTokens: [data.asset],
        token: data.token,
        poolMeta: vault.name,
        url: vault.url,
      };
    })
    .filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  protocolId: '5465',
  timetravel: false,
  apy,
  url: 'https://app.vectis.finance',
};
