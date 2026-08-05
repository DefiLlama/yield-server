/*
 * Origin ARM (Automated Redemption Manager) vaults.
 *
 * Every number here is read on-chain or from Merkl; Origin's squid is used only to enumerate the
 * ARMs, since there is no on-chain registry to discover them from.
 *
 * Each ARM is a share vault denominated in its liquidity asset (`assets[0]`):
 *   - `totalAssets()` is the net value backing the shares: it nets out the pending withdrawal
 *     queue and includes assets parked in the ARM's lending market, so it is the complete pool TVL.
 *   - `convertToAssets(1e18)` is the share price. Its trailing growth is the base yield.
 *   - Merkl incentives come from the shared helper, which reads Merkl's own API.
 */
const { gql, request } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const GRAPH_URL = 'https://origin.squids.live/origin-squid/graphql';

// chainId -> [DefiLlama chain name, sdk/coins-api chain key]
const CHAINS = {
  1: ['Ethereum', 'ethereum'],
  146: ['Sonic', 'sonic'],
};

const SHARE_PRICE_ABI = 'function convertToAssets(uint256 shares) view returns (uint256 assets)';
const ONE_SHARE = '1000000000000000000';

// Trailing window for the base APY: two reads, now and 30 days ago. 30d rather than something
// shorter because ARM yield arrives in lumps -- over 14d the OS ARM reads 0% and the Ethena ARM
// swings by 2pp.
const TRAILING_DAYS = 30;
const DAY_SECONDS = 86400;

// An ARM earns single-digit percent a year, i.e. well under 0.05%/day. A larger move across the
// window is a seeding or re-initialisation event, not yield -- the USDC ARM's share price doubled
// overnight when it was funded out of its dust seed, which annualises to 7.1e9%.
const MAX_DAILY_MOVE = 0.005;

// Shorter windows tried, longest first, only for ARMs whose full window is unusable: either they
// did not exist 30 days ago, or a jump like the above sits inside it. Everything else costs two
// calls and never touches these. Kept short deliberately -- each entry is a round trip, and this
// only applies to ARMs younger than the window or recently reseeded, which both age out of it.
const FALLBACK_DAYS = [14, 7, 3];

// The OS ARM (Sonic) is wound down -- a few hundred dollars of residual TVL, no longer a live
// product -- so it is excluded rather than listed as an active pool.
const EXCLUDED = new Set(['0x2f872623d1e1af5835b08b0e49aad2d81d649d30']);

const armsQuery = gql`
  query Arms {
    arms(limit: 100) {
      address
      chainId
      symbol
      assets
      assetDecimals
    }
  }
`;

const sharePricesAt = (chainKey, addresses, block) =>
  sdk.api.abi
    .multiCall({
      chain: chainKey,
      abi: SHARE_PRICE_ABI,
      calls: addresses.map((target) => ({ target, params: ONE_SHARE })),
      block,
      permitFailure: true,
    })
    .then((r) => r.output.map((o) => (o.output === null ? null : Number(o.output))));

const sharePricesDaysAgo = (chainKey, addresses, days) =>
  utils
    .getPriceApiData(
      `/block/${chainKey}/${Math.floor(Date.now() / 1000) - days * DAY_SECONDS}`
    )
    .then((r) => {
      // Without a height the read would silently fall back to the latest block, making the
      // window's two ends identical and reporting 0% rather than failing. Throwing hands it to
      // the per-chain catch, which skips this chain and retries next run.
      if (!r?.height) throw new Error(`no block height for ${chainKey} ${days}d ago`);
      return sharePricesAt(chainKey, addresses, r.height);
    });

// Compound the share-price growth across a window into an annual rate. Null when the ARM did not
// exist at the far end, or when the move is too large to be yield.
const windowApy = (current, previous, days) => {
  if (!(current > 0) || !(previous > 0)) return null;
  if (Math.abs(current / previous - 1) > (1 + MAX_DAILY_MOVE) ** days - 1) return null;
  return ((current / previous) ** (365 / days) - 1) * 100;
};

// Base APY for every ARM on a chain. The common path is two reads; only ARMs that fail the full
// window fall through to the shorter ones.
const chainApys = async (chainKey, addresses) => {
  const [current, previous] = await Promise.all([
    sharePricesAt(chainKey, addresses, undefined),
    sharePricesDaysAgo(chainKey, addresses, TRAILING_DAYS),
  ]);

  const apys = addresses.map((_, i) => windowApy(current[i], previous[i], TRAILING_DAYS));

  const pending = apys.map((apy, i) => (apy === null ? i : -1)).filter((i) => i >= 0);
  if (!pending.length) return apys;

  const pendingAddresses = pending.map((i) => addresses[i]);
  const rows = await Promise.all(
    FALLBACK_DAYS.map((days) => sharePricesDaysAgo(chainKey, pendingAddresses, days))
  );

  pending.forEach((armIndex, k) => {
    for (let j = 0; j < FALLBACK_DAYS.length; j += 1) {
      const apy = windowApy(current[armIndex], rows[j][k], FALLBACK_DAYS[j]);
      if (apy !== null) {
        apys[armIndex] = apy;
        return;
      }
    }
  });

  return apys;
};

const apy = async () => {
  const { arms } = await request(GRAPH_URL, armsQuery);
  const supported = arms.filter(
    (arm) => CHAINS[arm.chainId] && !EXCLUDED.has(arm.address.toLowerCase())
  );

  const priceKeys = supported.map(
    (arm) => `${CHAINS[arm.chainId][1]}:${arm.assets[0]}`
  );
  const prices = (
    await utils.getPriceApiData(
      `/prices/current/${[...new Set(priceKeys)].join(',')}`
    )
  ).coins;

  // Grouped per chain so the block lookups and share-price reads are shared across its ARMs.
  const byChain = {};
  supported.forEach((arm, i) => {
    const chainKey = CHAINS[arm.chainId][1];
    (byChain[chainKey] = byChain[chainKey] || []).push({ arm, i });
  });

  const totalAssets = [];
  const apyBase = [];

  await Promise.all(
    Object.entries(byChain).map(async ([chainKey, entries]) => {
      const addresses = entries.map((e) => e.arm.address);

      try {
        const [assets, apys] = await Promise.all([
          sdk.api.abi.multiCall({
            chain: chainKey,
            abi: 'uint256:totalAssets',
            calls: addresses.map((target) => ({ target })),
            permitFailure: true,
          }),
          chainApys(chainKey, addresses),
        ]);

        entries.forEach((entry, k) => {
          totalAssets[entry.i] = assets.output[k].output;
          apyBase[entry.i] = apys[k];
        });
      } catch (e) {
        // A chain's RPC or block lookup failing shouldn't take the other chains' pools with it.
        // Its ARMs stay unresolved, get filtered out below, and are picked up next run.
        console.log(`origin-arm: skipping ${chainKey} this run: ${e.message}`);
      }
    })
  );

  const pools = supported
    .map((arm, i) => {
      const [chain, priceChain] = CHAINS[arm.chainId];
      const address = arm.address.toLowerCase();
      const price = prices[`${priceChain}:${arm.assets[0]}`]?.price;
      if (price === undefined || totalAssets[i] == null) return null;
      if (!Number.isFinite(apyBase[i])) return null;

      return {
        // Bare lowercase address: the format the Lido ARM has always used, kept so its
        // existing yield history stays attached. Also what Merkl keys its opportunities on.
        pool: address,
        chain,
        project: 'origin-arm',
        symbol: arm.symbol,
        tvlUsd: (Number(totalAssets[i]) / 10 ** arm.assetDecimals[0]) * price,
        apyBase: apyBase[i],
        underlyingTokens: arm.assets,
        token: address,
        // Deep link to the ARM's own page, the form originprotocol.com/arm links to.
        url: `https://app.originprotocol.com/#/arm/${arm.chainId}:${arm.symbol}`,
      };
    })
    .filter((pool) => pool !== null && Number.isFinite(pool.tvlUsd));

  return addMerklRewardApy(pools, 'origin');
};

module.exports = {
  protocolId: '5280',
  timetravel: false,
  apy,
  url: 'https://originprotocol.com',
};
