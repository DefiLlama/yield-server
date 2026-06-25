const sdk = require('@defillama/sdk');
const stellarSdk = require('@stellar/stellar-sdk');
const { getPriceApiUrl, formatChain } = require('../utils');

const VAULTS = [
  // ETHEREUM — Lagoon
  { sdkChain: 'ethereum', address: '0xdae854d0896ad2fee335689a3f7b4a95fd1a3e46', name: 'Gami USDC', url: 'https://gamilabs.io/vaults/1/0xdae854d0896ad2fee335689a3f7b4a95fd1a3e46' },
  { sdkChain: 'ethereum', address: '0x33e1339567c183fbadcb43f72d11c47229d468ab', name: 'Gami Stake DAO USDC', url: 'https://gamilabs.io/vaults/1/0x33e1339567c183fbadcb43f72d11c47229d468ab' },
  { sdkChain: 'ethereum', address: '0x414070fb9e64fd69160d75da57e75ba11f9f605a', name: 'Gami WBTC', url: 'https://gamilabs.io/vaults/1/0x414070fb9e64fd69160d75da57e75ba11f9f605a' },
  { sdkChain: 'ethereum', address: '0x57e6824a8b15b709cefb4ccef644ba1349057e77', name: 'xBTCY', url: 'https://gamilabs.io/vaults/1/0x57e6824a8b15b709cefb4ccef644ba1349057e77' },
  { sdkChain: 'ethereum', address: '0x2a676c2744421b4fae65ce86b47adacb620047d4', name: 'Gami hemiBTC', url: 'https://gamilabs.io/vaults/1/0x2a676c2744421b4fae65ce86b47adacb620047d4' },
  { sdkChain: 'ethereum', address: '0x2031eceec018549a2c729cacd6c0bfc4be2524ed', name: 'Gami ETH', url: 'https://gamilabs.io/vaults/1/0x2031eceec018549a2c729cacd6c0bfc4be2524ed' },
  { sdkChain: 'ethereum', address: '0xfab0f56c28e3f874b15922b213e696f37b670916', name: 'Coinshift USPC Prime', url: 'https://gamilabs.io/vaults/1/0xfab0f56c28e3f874b15922b213e696f37b670916' },
  { sdkChain: 'ethereum', address: '0x09252d2c4afca9b1479efdd39faa53de9ff23114', name: 'Coinshift USPC High Yield', url: 'https://gamilabs.io/vaults/1/0x09252d2c4afca9b1479efdd39faa53de9ff23114' },
  // ETHEREUM — Gearbox
  { sdkChain: 'ethereum', address: '0x683faf5bafd88d4c383ccaf3d61c26af2e164409', name: 'Gami Gearbox WBTC', url: 'https://gamilabs.io/vaults/1/0x683faf5bafd88d4c383ccaf3d61c26af2e164409' },
  // BASE — Spectra (TVL/APY sourced from the Spectra API by MetaVault address; the
  // on-chain wrapper's totalAssets() undercounts capital deployed into Spectra positions)
  { sdkChain: 'base', address: '0x776f95321a0285f8bcde149e3264d16dc08da69a', name: 'Gami Spectra USDC', url: 'https://gamilabs.io/vaults/8453/0x5e93e1193a5e297cba0856e9b3f22b6e05429b9a', isSpectra: true, spectraMetavault: '0x5e93e1193a5e297cba0856e9b3f22b6e05429b9a' },
  // FLARE — Spectra
  { sdkChain: 'flare', address: '0x6420a613e936602ca3f1ad5680b3f4d47d473bf1', name: 'Flare XRP Yield Prime', url: 'https://gamilabs.io/vaults/14/0x0c4f32c53d4b91a019c7c9d8da14af140295eef6', isSpectra: true, spectraMetavault: '0x0c4f32c53d4b91a019c7c9d8da14af140295eef6' },
  // HEMI — Lagoon
  { sdkChain: 'hemi', address: '0x1e32c96757c07775ca4fc796c4f4311722eaf35e', name: 'Hemi USDC', url: 'https://gamilabs.io/vaults/43111/0x1e32c96757c07775ca4fc796c4f4311722eaf35e' },
  // AVAX — Lagoon
  { sdkChain: 'avax', address: '0xb3a2bcb30c1460d88db18b42a29fae2399952874', name: 'USDC Avalanche Core', url: 'https://gamilabs.io/vaults/43114/0xb3a2bcb30c1460d88db18b42a29fae2399952874' },
  // AVAX — Silo Vaults V2
  // NOTE: Silo Vault V2 uses ERC-4626 with a decimal offset of 6 (inflation-attack mitigation
  // per Silo V2 design). Because of this offset, convertToAssets(10^shareDec) returns an
  // integer-rounded value (~1) that loses precision. We therefore compute APY from the
  // totalAssets/totalSupply raw ratio rather than convertToAssets — this is precise
  // regardless of decimal offset and works for all ERC-4626 vaults in this adapter.
  { sdkChain: 'avax', address: '0x1F0570a081FeE0e4dF6eAC470f9d2D53CDEDa1c5', name: 'Gami Silo USDC', url: 'https://gamilabs.io/vaults/43114/0x1F0570a081FeE0e4dF6eAC470f9d2D53CDEDa1c5' },
  { sdkChain: 'avax', address: '0x0F78Ea587D8E2950319e0b467c665bD2CB73051B', name: 'Gami Silo AVAX', url: 'https://gamilabs.io/vaults/43114/0x0F78Ea587D8E2950319e0b467c665bD2CB73051B' },
];

const ABI = {
  asset: 'address:asset',
  totalAssets: 'uint256:totalAssets',
  totalSupply: 'uint256:totalSupply',
  decimals: 'uint8:decimals',
  symbol: 'string:symbol',
  convertToAssets: 'function convertToAssets(uint256 shares) view returns (uint256)',
};

const ONE_DAY = 86400;
const ONE_WEEK = 86400 * 7;
const THIRTY_DAYS = 86400 * 30;

// Spectra MetaVaults: their official API is the source of truth for TVL and APY.
const SPECTRA_SLUG = { base: 'base', flare: 'flare' };
const spectraApiUrl = (slug) =>
  `https://api.spectra.finance/v1/${slug}/metavaults?source=defillama`;

// Stellar (Soroban) Upshift vaults curated by Gami Labs. The August Digital API serves
// both TVL (USD) and the reported target APY for these vaults.
const AUGUST_API =
  'https://api.augustdigital.io/api/v1/tokenized_vault?status=active&load_subaccounts=false&load_snapshots=false';
const STELLAR_VAULT_ADDRESSES = [
  'CCL3WITWFFXIHV2I52ECV5DPIEOFSTU3PBPR53ILPLF2IP5KHECXRUTY', // Gami earnUSDC
  'CC6TRAPQD3NK7THUKWPV5SL2JHKQGNXZVB6S6MVYFSLRWAKEFUWZKZ7J', // Gami earnXLM
];
const SOROBAN_RPC_URL = 'https://soroban-rpc.creit.tech/';
// Deterministic, unfunded account used only to simulate read-only Soroban calls.
const SOROBAN_READ_ACCOUNT = stellarSdk.StrKey.encodeEd25519PublicKey(Buffer.alloc(32));

// Simulate a read-only Soroban contract call and return its decoded return value.
async function sorobanRead(server, contractId, method) {
  const account = new stellarSdk.Account(SOROBAN_READ_ACCOUNT, '0');
  const tx = new stellarSdk.TransactionBuilder(account, {
    fee: stellarSdk.BASE_FEE,
    networkPassphrase: stellarSdk.Networks.PUBLIC,
  })
    .addOperation(new stellarSdk.Contract(contractId).call(method))
    .setTimeout(30)
    .build();
  const sim = await server.simulateTransaction(tx);
  if (stellarSdk.rpc.Api.isSimulationError(sim)) throw new Error(sim.error);
  return stellarSdk.scValToNative(sim.result.retval);
}

// Assets-per-share for an OZ FungibleVault, normalising the share/asset decimals offset
// (these vaults use a 6-decimal offset for inflation-attack mitigation, like Silo V2).
async function stellarPricePerShare(server, contractId, assetDecimals) {
  const [totalAssets, totalSupply, shareDecimals] = await Promise.all([
    sorobanRead(server, contractId, 'total_assets'),
    sorobanRead(server, contractId, 'total_supply'),
    sorobanRead(server, contractId, 'decimals'),
  ]);
  if (BigInt(totalSupply) <= 0n) return undefined;
  const SCALE = 10n ** 18n;
  const offset = Number(shareDecimals) - assetDecimals; // shares carry `offset` extra decimals
  const num = BigInt(totalAssets) * SCALE * (offset >= 0 ? 10n ** BigInt(offset) : 1n);
  const den = BigInt(totalSupply) * (offset < 0 ? 10n ** BigInt(-offset) : 1n);
  return Number(num / den) / 1e18;
}

async function fetchJson(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function multi(chain, abi, calls, block) {
  const params = { chain, abi, calls, permitFailure: true };
  if (block) params.block = block;
  const res = await sdk.api.abi.multiCall(params);
  return res.output.map(r => r.output);
}

function ppsRatio(ta, ts) {
  if (ta == null || ts == null) return null;
  const taNum = Number(ta);
  const tsNum = Number(ts);
  if (tsNum === 0 || !isFinite(taNum) || !isFinite(tsNum)) return null;
  return taNum / tsNum;
}

function annualizedApy(ppsNow, ppsPast, days) {
  if (!ppsNow || !ppsPast || ppsPast <= 0 || ppsNow <= ppsPast) return 0;
  return (Math.pow(ppsNow / ppsPast, 365 / days) - 1) * 100;
}

async function processChain(sdkChain, vaults) {
  const targets = vaults.map(v => ({ target: v.address }));

  const [assets, shareDecimals, totalAssetsArr, totalSupplyArr, shareSymbols] = await Promise.all([
    multi(sdkChain, ABI.asset, targets),
    multi(sdkChain, ABI.decimals, targets),
    multi(sdkChain, ABI.totalAssets, targets),
    multi(sdkChain, ABI.totalSupply, targets),
    multi(sdkChain, ABI.symbol, targets),
  ]);

  const assetTargets = assets.map(a => ({
    target: a || '0x0000000000000000000000000000000000000000',
  }));
  const underlyingDecimals = await multi(sdkChain, ABI.decimals, assetTargets);

  const ppsCalls = vaults.map((v, i) => ({
    target: v.address,
    params: [shareDecimals[i] != null ? (10n ** BigInt(shareDecimals[i])).toString() : '0'],
  }));
  const ppsRaw = await multi(sdkChain, ABI.convertToAssets, ppsCalls);

  const now = Math.floor(Date.now() / 1000);
  let taHist1d = vaults.map(() => null);
  let tsHist1d = vaults.map(() => null);
  let taHist7d = vaults.map(() => null);
  let tsHist7d = vaults.map(() => null);
  let taHist30d = vaults.map(() => null);
  let tsHist30d = vaults.map(() => null);

  try {
    const [b1Resp, b7Resp, b30Resp] = await Promise.all([
      fetchJson(getPriceApiUrl(`/block/${sdkChain}/${now - ONE_DAY}`)),
      fetchJson(getPriceApiUrl(`/block/${sdkChain}/${now - ONE_WEEK}`)),
      fetchJson(getPriceApiUrl(`/block/${sdkChain}/${now - THIRTY_DAYS}`)),
    ]);

    if (b1Resp?.height > 0) {
      [taHist1d, tsHist1d] = await Promise.all([
        multi(sdkChain, ABI.totalAssets, targets, b1Resp.height),
        multi(sdkChain, ABI.totalSupply, targets, b1Resp.height),
      ]);
    }
    if (b7Resp?.height > 0) {
      [taHist7d, tsHist7d] = await Promise.all([
        multi(sdkChain, ABI.totalAssets, targets, b7Resp.height),
        multi(sdkChain, ABI.totalSupply, targets, b7Resp.height),
      ]);
    }
    if (b30Resp?.height > 0) {
      [taHist30d, tsHist30d] = await Promise.all([
        multi(sdkChain, ABI.totalAssets, targets, b30Resp.height),
        multi(sdkChain, ABI.totalSupply, targets, b30Resp.height),
      ]);
    }
  } catch (e) {
    // Historical block lookup failed on this chain; APY fields fall back to 0
  }

  const validAssets = [...new Set(assets.filter(Boolean).map(a => a.toLowerCase()))];
  const priceKeys = validAssets.map(a => `${sdkChain}:${a}`).join(',');
  const priceResp = priceKeys
    ? await fetchJson(getPriceApiUrl(`/prices/current/${priceKeys}`))
    : { coins: {} };
  const priceMap = priceResp?.coins || {};

  return vaults.map((v, i) => {
    const asset = assets[i];
    const undDec = underlyingDecimals[i] != null ? Number(underlyingDecimals[i]) : null;
    const ta = totalAssetsArr[i];
    const ts = totalSupplyArr[i];
    const pps = ppsRaw[i];
    const sym = shareSymbols[i];

    if (!asset || undDec == null || ta == null || ts == null || pps == null) return null;

    const priceUsd = priceMap[`${sdkChain}:${asset.toLowerCase()}`]?.price;
    if (priceUsd == null) return null;

    const tvlUsd = (Number(ta) / 10 ** undDec) * priceUsd;
    const pricePerShare = Number(pps) / 10 ** undDec;

    const rNow = ppsRatio(ta, ts);
    const r1d = ppsRatio(taHist1d[i], tsHist1d[i]);
    const r7d = ppsRatio(taHist7d[i], tsHist7d[i]);
    const r30d = ppsRatio(taHist30d[i], tsHist30d[i]);

    const apy1d = annualizedApy(rNow, r1d, 1);
    const apyBase7d = annualizedApy(rNow, r7d, 7);
    const apyBase30d = annualizedApy(rNow, r30d, 30);

    // Use 30d as primary apyBase for stability (smooths through harvest-driven PPS jumps
    // like Spectra MetaVaults); fall back to 7d then 1d if archive RPC unavailable on chain.
    let apyBase = apyBase30d;
    if (apyBase === 0 && apyBase7d > 0) apyBase = apyBase7d;
    if (apyBase === 0 && apy1d > 0) apyBase = apy1d;

    return {
      pool: `${v.address.toLowerCase()}-${sdkChain}`,
      chain: sdkChain,
      project: 'gami-labs',
      symbol: sym || v.name,
      tvlUsd,
      apyBase,
      apyBase7d,
      pricePerShare,
      underlyingTokens: [asset.toLowerCase()],
      poolMeta: v.name,
      url: v.url,
    };
  }).filter(Boolean);
}

// Spectra vaults: pull authoritative TVL and APY from the Spectra API, matched by the
// underlying MetaVault address. Reported under the gami-labs project with Gami branding.
async function processSpectra(sdkChain, vaults) {
  const slug = SPECTRA_SLUG[sdkChain];
  if (!slug) return [];

  let mvs;
  try {
    const data = await fetchJson(spectraApiUrl(slug), {
      headers: { 'x-client-id': 'defillama' },
    });
    mvs = data.flat();
  } catch (e) {
    // Spectra API unavailable; skip rather than emit an undercounted on-chain TVL
    return [];
  }

  const byAddr = {};
  for (const mv of mvs) byAddr[(mv.address || '').toLowerCase()] = mv;

  return vaults.map(v => {
    const mv = byAddr[v.spectraMetavault.toLowerCase()];
    if (!mv || mv.status !== 'VISIBLE') return null;

    const tvlUsd = mv.tvl?.usd;
    if (tvlUsd == null) return null;

    const total = mv.liveApy?.total || 0;
    const apyBase = mv.liveApy?.details?.base || 0;

    return {
      pool: `${v.address.toLowerCase()}-${sdkChain}`,
      chain: sdkChain,
      project: 'gami-labs',
      symbol: mv.underlying.symbol,
      tvlUsd,
      apyBase,
      apyReward: total - apyBase, // remove native APY to isolate rewards
      pricePerShare: mv.price?.underlying, // assets per share, in underlying terms
      rewardTokens: Object.values(mv.liveApy?.details?.rewardTokens || {}).map(t => t.address),
      underlyingTokens: [mv.underlying.address],
      poolMeta: v.name,
      url: v.url,
    };
  }).filter(Boolean);
}

// Stellar vaults: pull TVL (USD) and the reported target APY from the August Digital API,
// matched by Soroban contract address. Reported under the gami-labs project.
async function processStellar() {
  let vaults;
  try {
    vaults = await fetchJson(AUGUST_API);
  } catch (e) {
    // August API unavailable; skip the Stellar vaults this run
    return [];
  }

  const byAddr = {};
  for (const v of vaults) byAddr[(v.address || '').toUpperCase()] = v;

  const server = new stellarSdk.rpc.Server(SOROBAN_RPC_URL);

  const pools = await Promise.all(STELLAR_VAULT_ADDRESSES.map(async addr => {
    const v = byAddr[addr.toUpperCase()];
    if (!v) return null;

    const tvlUsd = v.tvl;
    if (tvlUsd == null || !isFinite(tvlUsd)) return null;

    const meta = v.stellar_vault_metadata || {};
    const reportedApy = v.reported_apy?.apy; // decimal fraction, e.g. 0.07 = 7%

    // pricePerShare is read on-chain (Soroban has no historical reads, so this is
    // best-effort: publish without it if the RPC is unavailable).
    let pricePerShare;
    try {
      pricePerShare = await stellarPricePerShare(server, addr, meta.deposit_token_decimals ?? 7);
    } catch (e) {
      // ignore — pricePerShare is optional
    }

    return {
      pool: `${addr}-stellar`.toLowerCase(),
      chain: formatChain('stellar'),
      project: 'gami-labs',
      symbol: meta.deposit_token_symbol || v.receipt_token_symbol,
      tvlUsd,
      apyBase: (reportedApy != null ? reportedApy : 0) * 100,
      pricePerShare,
      underlyingTokens: meta.deposit_token_address ? [meta.deposit_token_address] : undefined,
      poolMeta: v.vault_name,
      url: `https://gamilabs.io/vaults/100148/${addr}`,
    };
  }));

  return pools.filter(Boolean);
}

const apy = async () => {
  const groupByChain = (vaults) => vaults.reduce((acc, v) => {
    (acc[v.sdkChain] ||= []).push(v);
    return acc;
  }, {});

  const onchainByChain = groupByChain(VAULTS.filter(v => !v.isSpectra));
  const spectraByChain = groupByChain(VAULTS.filter(v => v.isSpectra));

  const results = await Promise.all([
    ...Object.entries(onchainByChain).map(([chain, vaults]) => processChain(chain, vaults)),
    ...Object.entries(spectraByChain).map(([chain, vaults]) => processSpectra(chain, vaults)),
    processStellar(),
  ]);

  return results.flat();
};

module.exports = {
  protocolId: '7954',
  timetravel: false,
  apy,
  url: 'https://gamilabs.io',
};
