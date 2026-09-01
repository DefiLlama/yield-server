/**
 * Chainflip Lending — yield-server adapter (fully on-chain)
 *
 * TVL METHODOLOGY (aligned with Aave v3 and Compound v3)
 * ─────────────────────────────────────────────────────────────────────────
 * `tvlUsd` must represent idle liquidity: assets deposited by lenders that
 * are not currently deployed in active loans. This is what Aave v3 calls
 * "available liquidity" and what Compound v3 tracks as the spread between
 * totalSupply and totalBorrow in each Comet market.
 *
 * The previous adapter forwarded `pool.tvl` from an external indexer API
 * (explorer-service-processor.chainflip.io/defi-llama/yield). That field
 * maps to `total_amount` on-chain — the full amount supplied by lenders
 * including the portion already lent out. In DefiLlama's taxonomy that is
 * "Supplied", not "TVL". Concrete impact at time of fix:
 *
 *   USDT  reported $480 K   →   actual idle liquidity $2.9 K  (util. 99.4 %)
 *   USDC  reported $148 K   →   actual idle liquidity $4.0 K  (util. 97.3 %)
 *   BTC   reported $1.29 M  →   actual idle liquidity $1.10 M (util. 14.8 %)
 *
 * Fix: tvlUsd is now sourced from cf_lending_pools → available_amount.
 *
 * APY METHODOLOGY
 * ─────────────────────────────────────────────────────────────────────────
 * Supply APY (apyBase) is derived entirely from on-chain fields returned by
 * cf_lending_pools:
 *
 *   apyBase = (current_interest_rate / 1e6) × (utilisation_rate / 1e6) × 100
 *
 * Both fields are Permill values (parts per million; 1 000 000 = 100 %).
 *
 * Per cf_lending_config, extra_interest = 0: the network takes no continuous
 * cut from borrow interest. The network earns only from one-shot fees
 * (20 % of origination_fee and 20 % of liquidation_fee). Therefore 100 % of
 * current_interest_rate accrues to lenders, and no deduction is applied.
 *
 * This mirrors the Aave v3 formula:
 *   liquidityRate / RAY × 100
 *   = variableBorrowRate × utilizationRate × (1 − reserveFactor)
 *
 * Known conservatism: one-shot origination fees (1 % per loan, 80 % to
 * lenders) boost actual lender yield above the formula, especially for BTC
 * where borrow utilisation is low but loan origination turnover is high.
 * Deriving that component requires indexing historical loan events, which is
 * not available from a single chain snapshot — the same limitation that
 * prevents Aave adapters from including flash-loan fee revenue in apyBase.
 *
 * DATA SOURCE
 * ─────────────────────────────────────────────────────────────────────────
 * All lending data comes from the Chainflip mainnet Substrate RPC
 * (https://rpc.chainflip.io) via the cf_lending_pools custom method, which
 * reads live pallet storage with no intermediary.
 * Asset prices are fetched from coins.llama.fi using coingecko IDs.
 * No external indexer or third-party API is used.
 */

const utils = require('../utils');
const axios = require('axios');

const RPC_ENDPOINT = 'https://rpc.chainflip.io';

/**
 * Static metadata per lending asset.
 * Key format: "Chain:ASSET" matching the on-chain RPC asset descriptor.
 *
 * decimals: native denomination used by the chain for this asset
 *   BTC  → satoshis  (8 decimals)
 *   ETH  → wei       (18 decimals)
 *   SOL  → lamports  (9 decimals)
 *   USDT → μUSDT     (6 decimals)
 *   USDC → μUSDC     (6 decimals)
 *
 * Add a new entry here when Chainflip introduces additional lending assets.
 */
const ASSET_META: Record<string, {
  decimals: number;
  chain: string;
  coingeckoId: string;
  tokenContractAddress: string | null;
}> = {
  'Bitcoin:BTC':   { decimals: 8,  chain: 'bitcoin',  coingeckoId: 'bitcoin',  tokenContractAddress: null },
  'Ethereum:ETH':  { decimals: 18, chain: 'ethereum', coingeckoId: 'ethereum', tokenContractAddress: null },
  'Solana:SOL':    { decimals: 9,  chain: 'solana',   coingeckoId: 'solana',   tokenContractAddress: null },
  'Ethereum:USDT': { decimals: 6,  chain: 'ethereum', coingeckoId: 'tether',   tokenContractAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7' },
  'Ethereum:USDC': { decimals: 6,  chain: 'ethereum', coingeckoId: 'usd-coin', tokenContractAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' },
};

async function cfRpc(method: string, params: unknown[] = []): Promise<any> {
  const { data } = await axios.post(RPC_ENDPOINT, { jsonrpc: '2.0', method, params, id: 1 });
  return data.result;
}

const getPools = async () => {
  const onchainPools = await cfRpc('cf_lending_pools', [null, null]);

  // Batch all price requests into a single coins.llama.fi call.
  const cgIds = [...new Set(
    onchainPools
      .map((p: any) => ASSET_META[`${p.asset.chain}:${p.asset.asset}`]?.coingeckoId)
      .filter(Boolean)
      .map((id: string) => `coingecko:${id}`)
  )].join(',');

  const { data: priceData } = await axios.get(
    `https://coins.llama.fi/prices/current/${cgIds}`
  );

  return onchainPools
    .map((pool: any) => {
      const metaKey = `${pool.asset.chain}:${pool.asset.asset}`;
      const meta    = ASSET_META[metaKey];
      if (!meta) return null; // asset not yet in the metadata table — skip

      // tvlUsd: idle liquidity only (available_amount), not total supplied.
      // BigInt parse avoids float truncation for ETH amounts in wei which
      // exceed Number.MAX_SAFE_INTEGER (~9 × 10^15 vs ETH's 10^18 scale).
      const available = Number(BigInt(pool.available_amount)) / 10 ** meta.decimals;
      const price     = priceData.coins[`coingecko:${meta.coingeckoId}`]?.price ?? 0;

      // apyBase: instantaneous supply rate from on-chain fields (Permill units).
      // extra_interest = 0 per cf_lending_config → full rate goes to lenders.
      const apyBase =
        (pool.current_interest_rate / 1e6) *
        (pool.utilisation_rate       / 1e6) *
        100;

      return {
        pool:             `${pool.asset.asset.toLowerCase()}-chainflip-lending`,
        chain:            utils.formatChain(meta.chain),
        project:          'chainflip-lending',
        symbol:           pool.asset.asset,
        tvlUsd:           available * price,
        apyBase,
        url:              `https://scan.chainflip.io/pools/${pool.asset.asset.toLowerCase()}/lending`,
        underlyingTokens: [meta.tokenContractAddress ?? `coingecko:${meta.coingeckoId}`],
      };
    })
    .filter(Boolean);
};

module.exports = {
  protocolId: '7586',
  timetravel: false,
  apy: getPools,
  url: 'https://scan.chainflip.io/lending/markets',
};
