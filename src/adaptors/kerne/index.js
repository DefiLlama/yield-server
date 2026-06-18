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
// Everything is read on-chain at adapter run-time (no Kerne API dependency):
//   - TVL          : skUSD.totalAssets() (kUSD, asset decimals) x USDC price
//                    (coins.llama.fi). kUSD is PSM-redeemable 1:1 for USDC, so
//                    the USDC price is the conservative, verifiable kUSD price.
//   - pricePerShare: skUSD.convertToAssets(1 share), normalised to the asset's
//                    decimals (1.0 == par).
//   - apyBase      : realised share-price growth of skUSD over a trailing 24h
//                    window, annualised. This is the yield skUSD holders have
//                    actually earned, derived purely from on-chain share price
//                    (no projection, no off-chain rate).
//   - asset()      : sanity-checked = kUSD (refuses to publish on mismatch).
//
// Genesis guard:
//   skUSD is in its early seeding phase. While totalSupply is below the seed
//   threshold the share price is not yet economically meaningful (a pre-seed
//   deposit can transiently inflate convertToAssets), so the adapter reports
//   par price-per-share and 0 realised APY until the vault is seeded. Once
//   seeded, both values flow directly from on-chain share-price growth with no
//   code change. Genesis-phase TVL is intentionally below DefiLlama's public
//   yields display threshold, so the pool stays hidden until seeded.
//
// 2026-06-18 revision: switched APY from the kerne.fi/api/apy methodology field
//   to a fully on-chain realised share-price computation, added pricePerShare,
//   and dropped the empty apyReward/rewardTokens and the poolMeta string, per
//   maintainer review on PR #2688.
//
// DefiLlama slug note: DefiLlama assigned this protocol the slug "kerne" when
//   the TVL adapter merged (DefiLlama-Adapters#19306, 2026-05-18), so the
//   directory and project field both follow the public slug "kerne".

const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const CHAIN = 'base';
const SKUSD_ADDRESS = '0xdEd74F7E06efc76455C07418b8b74Cc2bc009DB4';
const KUSD_ADDRESS = '0x5C2EfdF0D8D286959b42308966bc2B97f5680AA3';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const DAY = 24 * 3600;
const CONVERT_TO_ASSETS_ABI =
  'function convertToAssets(uint256) view returns (uint256)';

// Below this share supply the vault is treated as pre-seed (see genesis guard).
// skUSD shares carry an inflation-attack decimals offset, so the seed threshold
// is expressed in raw share units: ~1e-3 of a whole share.
const SEED_SUPPLY_THRESHOLD = 1e21;

const blockForTimestamp = async (timestamp) =>
  (await axios.get(`https://coins.llama.fi/block/${CHAIN}/${timestamp}`)).data
    .height;

const convertToAssets = async (shareUnits, block) =>
  (
    await sdk.api.abi.call({
      target: SKUSD_ADDRESS,
      abi: CONVERT_TO_ASSETS_ABI,
      params: [shareUnits],
      chain: CHAIN,
      ...(block ? { block } : {}),
    })
  ).output;

const apy = async () => {
  // 1. Core on-chain reads.
  const [totalAssetsCall, totalSupplyCall, assetCall, shareDecCall, assetDecCall] =
    await Promise.all([
      sdk.api.abi.call({ target: SKUSD_ADDRESS, abi: 'uint256:totalAssets', chain: CHAIN }),
      sdk.api.abi.call({ target: SKUSD_ADDRESS, abi: 'uint256:totalSupply', chain: CHAIN }),
      sdk.api.abi.call({ target: SKUSD_ADDRESS, abi: 'address:asset', chain: CHAIN }),
      sdk.api.abi.call({ target: SKUSD_ADDRESS, abi: 'uint8:decimals', chain: CHAIN }),
      sdk.api.abi.call({ target: KUSD_ADDRESS, abi: 'uint8:decimals', chain: CHAIN }),
    ]);

  // 2. Defensive: ensure skUSD.asset() is still kUSD (in case of redeploy).
  const onchainAsset = String(assetCall.output).toLowerCase();
  if (onchainAsset !== KUSD_ADDRESS.toLowerCase()) {
    throw new Error(
      `skUSD.asset() returned ${onchainAsset}, expected kUSD ${KUSD_ADDRESS}`
    );
  }

  const shareDecimals = Number(shareDecCall.output);
  const assetDecimals = Number(assetDecCall.output);
  const totalSupply = Number(totalSupplyCall.output);
  const shareUnit = (10n ** BigInt(shareDecimals)).toString(); // one whole share

  // 3. Price the kUSD backing at the USDC price (kUSD is PSM-redeemable 1:1 for
  //    USDC; using the coins.llama.fi USDC price keeps pricing verifiable
  //    through the same source the rest of yield-server uses).
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

  const tvlUsd = (Number(totalAssetsCall.output) / 10 ** assetDecimals) * usdcPrice;

  // 4. Genesis guard: report par + 0 realised APY until the vault is seeded.
  let pricePerShare = 1;
  let apyBase = 0;

  if (totalSupply >= SEED_SUPPLY_THRESHOLD) {
    // 4a. price-per-share now, normalised to asset decimals (1.0 == par).
    const ppsNowRaw = await convertToAssets(shareUnit);
    pricePerShare = Number(ppsNowRaw) / 10 ** assetDecimals;

    // 4b. realised APY from the trailing-24h change in share price.
    try {
      const now = Math.floor(Date.now() / 1e3);
      const blockYesterday = await blockForTimestamp(now - DAY);
      const ppsYesterdayRaw = await convertToAssets(shareUnit, blockYesterday);
      const ratio = Number(ppsNowRaw) / Number(ppsYesterdayRaw);
      if (Number.isFinite(ratio) && ratio > 0) {
        const annualised = (ratio ** 365 - 1) * 100;
        // Ignore non-positive drift and discard spurious early-window spikes;
        // realised skUSD carry does not annualise above this band.
        if (Number.isFinite(annualised) && annualised > 0 && annualised <= 100) {
          apyBase = annualised;
        }
      }
    } catch (e) {
      // No archive read / contract too young for a 24h lookback: leave apyBase 0
      // (no realised yield can be proven yet) rather than fail the adapter.
      apyBase = 0;
    }
  }

  // 5. Refuse to publish nonsense.
  if (!Number.isFinite(tvlUsd) || tvlUsd < 0) {
    throw new Error(`Computed tvlUsd is not a valid non-negative number: ${tvlUsd}`);
  }
  if (!Number.isFinite(pricePerShare) || pricePerShare <= 0) {
    throw new Error(`Computed pricePerShare is not a valid positive number: ${pricePerShare}`);
  }

  return [
    {
      pool: `${SKUSD_ADDRESS}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'kerne',
      symbol: 'skUSD',
      tvlUsd,
      apyBase,
      pricePerShare,
      underlyingTokens: [KUSD_ADDRESS],
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
  // DefiLlama protocol id for slug "kerne" (defillama.com/protocol/kerne,
  // TVL adapter DefiLlama-Adapters#19306).
  protocolId: '7873',
};
