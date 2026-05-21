// Kerne Protocol — DefiLlama Yield Adapter
// ===========================================================
// Pool listed: KerneVault (ERC-4626) on Base, share symbol kLP, asset WETH.
//
// Contract (verified on Basescan):
//   https://basescan.org/address/0x8005bc7A86AD904C20fd62788ABED7546c1cF2AC#code
//
// Data sources (all pulled at adapter run-time, no Kerne API dependency):
//   - TVL   : KerneVault.totalAssets()          × WETH price (coins.llama.fi)
//   - APY   : KerneVault.projectedAPY()         (returns basis points)
//   - asset : KerneVault.asset()                (sanity-checked = WETH)
//
// Strategy: delta-neutral basis trade. Long leg accrues Lido stETH staking
// yield via off-chain accounting reported on-chain by the strategist; short
// leg captures perpetual funding on Hyperliquid. Yield is realized in kLP
// share price appreciation.
//
// Reviewer notes:
//   - vault.symbol() currently returns the string "2" (a placeholder set at
//     deploy time). We hardcode "kLP" which is the documented share-token
//     symbol (kerne.fi/docs).
//   - vault.name()  similarly returns "1". Cosmetic only.
//   - vault.projectedAPY() returns the governance-configured projected
//     return for the active strategy in basis points (1200 = 12.00%).
//
// This adapter supersedes the earlier draft at
//   https://github.com/DefiLlama/yield-server/pull/2254
// which was closed pending a TVL adapter on the DefiLlama-Adapters side.
//
// DefiLlama slug note: DefiLlama assigned this protocol the slug "kerne"
// when the TVL adapter merged (DefiLlama-Adapters#19306, 2026-05-18), so
// the project field below matches that slug. The TVL adapter directory in
// DefiLlama-Adapters remains projects/kerne-protocol/ per the module field
// on /api/protocols, but the yield-server adapter directory and project
// field both follow the public slug "kerne".

const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'base';
const VAULT_ADDRESS = '0x8005bc7A86AD904C20fd62788ABED7546c1cF2AC';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';

const apy = async () => {
  // 1. Parallel on-chain reads
  const [totalAssetsCall, projectedApyCall, assetCall] = await Promise.all([
    sdk.api.abi.call({
      target: VAULT_ADDRESS,
      abi: 'uint256:totalAssets',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: VAULT_ADDRESS,
      abi: 'uint256:projectedAPY',
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: VAULT_ADDRESS,
      abi: 'address:asset',
      chain: CHAIN,
    }),
  ]);

  // 2. Defensive: ensure vault.asset() is still WETH (in case of redeploy).
  const onchainAsset = String(assetCall.output).toLowerCase();
  if (onchainAsset !== WETH_ADDRESS.toLowerCase()) {
    throw new Error(
      `KerneVault.asset() returned ${onchainAsset}, expected WETH ${WETH_ADDRESS}`
    );
  }

  // 3. Price WETH via DefiLlama's coin price API (same source the rest of
  //    the yield-server uses; reviewers can verify pricing trivially).
  const priceKey = `${CHAIN}:${WETH_ADDRESS}`;
  const priceResp = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`,
    { timeout: 15_000 }
  );
  const ethPrice = priceResp?.data?.coins?.[priceKey]?.price;
  if (!Number.isFinite(ethPrice) || ethPrice <= 0) {
    throw new Error(
      `Invalid WETH price from coins.llama.fi for ${priceKey}: ${ethPrice}`
    );
  }

  // 4. Compose TVL and APY values.
  const totalAssetsEth = Number(totalAssetsCall.output) / 1e18;
  const tvlUsd = totalAssetsEth * ethPrice;
  const apyBase = Number(projectedApyCall.output) / 100;

  // 5. Refuse to publish nonsense.
  if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
    throw new Error(
      `Computed tvlUsd is not a valid non-negative number: ${tvlUsd}`
    );
  }
  if (!Number.isFinite(apyBase) || apyBase < 0 || apyBase > 1000) {
    throw new Error(
      `Computed apyBase out of sane range [0, 1000]: ${apyBase}`
    );
  }

  return [
    {
      pool: `${VAULT_ADDRESS}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'kerne',
      symbol: 'kLP',
      tvlUsd,
      apyBase,
      apyReward: 0,
      rewardTokens: [],
      underlyingTokens: [WETH_ADDRESS],
      poolMeta: 'ERC-4626: WETH → kLP (delta-neutral basis trade)',
      url: 'https://app.kerne.fi',
      token: VAULT_ADDRESS,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://kerne.fi',
};
