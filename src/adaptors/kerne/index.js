// Kerne Protocol — DefiLlama Yield Adapter
// ===========================================================
// Pool listed: skUSD (ERC-4626 staking vault) on Base.
//   skUSD wraps kUSD, the protocol's synthetic dollar, which is minted
//   1:1 against USDC through the on-chain Peg Stability Module. Yield
//   accrues to skUSD holders through a rising share price.
//
// Contracts (verified, Sourcify perfect_match):
//   skUSD : https://basescan.org/address/0xdEd74F7E06efc76455C07418b8b74Cc2bc009DB4
//   kUSD  : https://basescan.org/address/0x5C2EfdF0D8D286959b42308966bc2B97f5680AA3
//
// Data sources (pulled at adapter run-time):
//   - TVL : skUSD.totalAssets()  (kUSD, 18 decimals)  x  USDC price
//           (coins.llama.fi). kUSD is PSM-redeemable 1:1 for USDC, so
//           the USDC price is the conservative, verifiable kUSD price.
//   - APY : kerne.fi/api/apy field `expectedAPY` — the protocol's
//           published, recomputable methodology (Lido staking SMA +
//           Hyperliquid 180d trailing funding, costs and insurance
//           netted out). Formula reference is public on the same
//           endpoint and rendered on the kerne.fi homepage.
//   - asset(): sanity-checked = kUSD (refuses to publish on mismatch).
//
// Reviewer notes (2026-06-11 revision):
//   - This revision switches the tracked pool from the v1 WETH vault
//     (kLP) to skUSD. The v1 vault is in a publicly disclosed degraded
//     state pending a v2 redeploy and is intentionally excluded from
//     protocol TVL by kerne.fi/api/stats; skUSD over the PSM-backed
//     kUSD is the protocol's durable user-facing yield surface, so it
//     is the correct pool for DefiLlama to track long-term.
//   - Genesis-phase TVL is intentionally below the public yields
//     display threshold, so the pool stays hidden until seeded.
//
// This adapter supersedes the earlier draft at
//   https://github.com/DefiLlama/yield-server/pull/2254
// which was closed pending a TVL adapter on the DefiLlama-Adapters side.
//
// DefiLlama slug note: DefiLlama assigned this protocol the slug "kerne"
// when the TVL adapter merged (DefiLlama-Adapters#19306, 2026-05-18), so
// the directory and project field both follow the public slug "kerne".

const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'base';
const SKUSD_ADDRESS = '0xdEd74F7E06efc76455C07418b8b74Cc2bc009DB4';
const KUSD_ADDRESS = '0x5C2EfdF0D8D286959b42308966bc2B97f5680AA3';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const apy = async () => {
  // 1. Parallel on-chain reads
  const [totalAssetsCall, assetCall] = await Promise.all([
    sdk.api.abi.call({
      target: SKUSD_ADDRESS,
      abi: 'uint256:totalAssets',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: SKUSD_ADDRESS,
      abi: 'address:asset',
      chain: CHAIN,
    }),
  ]);

  // 2. Defensive: ensure skUSD.asset() is still kUSD (in case of redeploy).
  const onchainAsset = String(assetCall.output).toLowerCase();
  if (onchainAsset !== KUSD_ADDRESS.toLowerCase()) {
    throw new Error(
      `skUSD.asset() returned ${onchainAsset}, expected kUSD ${KUSD_ADDRESS}`
    );
  }

  // 3. Price the kUSD backing at the USDC price (kUSD is PSM-redeemable
  //    1:1 for USDC; using the coins.llama.fi USDC price keeps pricing
  //    verifiable through the same source the rest of yield-server uses).
  const priceKey = `${CHAIN}:${USDC_ADDRESS}`;
  const priceResp = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`,
    { timeout: 15_000 }
  );
  const usdcPrice = priceResp?.data?.coins?.[priceKey]?.price;
  if (!Number.isFinite(usdcPrice) || usdcPrice <= 0) {
    throw new Error(
      `Invalid USDC price from coins.llama.fi for ${priceKey}: ${usdcPrice}`
    );
  }

  // 4. Published APY from the protocol's open methodology endpoint.
  const apyResp = await axios.get('https://kerne.fi/api/apy', {
    timeout: 15_000,
  });
  const expectedAPY = apyResp?.data?.expectedAPY;
  if (!Number.isFinite(expectedAPY)) {
    throw new Error(
      `Invalid expectedAPY from kerne.fi/api/apy: ${expectedAPY}`
    );
  }

  // 5. Compose TVL and APY values.
  const tvlUsd = (Number(totalAssetsCall.output) / 1e18) * usdcPrice;
  const apyBase = Number(expectedAPY) * 100;

  // 6. Refuse to publish nonsense.
  if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
    throw new Error(
      `Computed tvlUsd is not a valid non-negative number: ${tvlUsd}`
    );
  }
  if (!Number.isFinite(apyBase) || apyBase < 0 || apyBase > 100) {
    throw new Error(`Computed apyBase out of sane range [0, 100]: ${apyBase}`);
  }

  return [
    {
      pool: `${SKUSD_ADDRESS}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'kerne',
      symbol: 'skUSD',
      tvlUsd,
      apyBase,
      apyReward: 0,
      rewardTokens: [],
      underlyingTokens: [KUSD_ADDRESS],
      poolMeta: 'ERC-4626: kUSD -> skUSD (staked delta-neutral synthetic dollar)',
      url: 'https://app.kerne.fi/stake',
      token: SKUSD_ADDRESS,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://kerne.fi',
};
