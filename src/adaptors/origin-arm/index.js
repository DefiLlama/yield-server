/*
 * Origin ARM (Automated Redemption Manager) vaults.
 *
 * Every number here is read on-chain or from Merkl; Origin's squid is used only to enumerate the
 * ARMs, since there is no on-chain registry to discover them from.
 *
 * Each ARM is a share vault denominated in its liquidity asset (`assets[0]`):
 *   - `totalAssets()` is the net value backing the shares: it nets out the pending withdrawal
 *     queue and includes assets parked in the ARM's lending market, so it is the complete pool TVL.
 *   - `convertToAssets(1e18)` is the share price, reported as `pricePerShare`. Its trailing
 *     growth over a fixed 7d window is the base yield.
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

// Trailing window for the base APY: two reads, now and 7 days ago. One fixed window for every
// ARM, no fallbacks to shorter ones, so the number means the same thing across pools and runs.
// ARM yield arrives in lumps, so expect a 7d rate to move more between runs than a longer one.
const TRAILING_DAYS = 7;
const DAY_SECONDS = 86400;

// An ARM earns single-digit percent a year, i.e. well under 0.05%/day. A larger move across the
// window is a seeding or re-initialisation event, not yield -- the USDC ARM's share price doubled
// overnight when it was funded out of its dust seed, which annualises to 7.1e9%. An ARM younger
// than the window, or one carrying a jump like that, has no usable rate and is left out until the
// event ages past the window.
const MAX_DAILY_MOVE = 0.005;

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

// Current share price and base APY for every ARM on a chain: two reads, both ends of the window.
const chainSharePrices = async (chainKey, addresses) => {
  const [current, previous] = await Promise.all([
    sharePricesAt(chainKey, addresses, undefined),
    sharePricesDaysAgo(chainKey, addresses, TRAILING_DAYS),
  ]);

  return addresses.map((_, i) => ({
    sharePrice: current[i],
    apy: windowApy(current[i], previous[i], TRAILING_DAYS),
  }));
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
  const sharePrice = [];

  await Promise.all(
    Object.entries(byChain).map(async ([chainKey, entries]) => {
      const addresses = entries.map((e) => e.arm.address);

      try {
        const [assets, shares] = await Promise.all([
          sdk.api.abi.multiCall({
            chain: chainKey,
            abi: 'uint256:totalAssets',
            calls: addresses.map((target) => ({ target })),
            permitFailure: true,
          }),
          chainSharePrices(chainKey, addresses),
        ]);

        entries.forEach((entry, k) => {
          totalAssets[entry.i] = assets.output[k].output;
          apyBase[entry.i] = shares[k].apy;
          sharePrice[entry.i] = shares[k].sharePrice;
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
        // Assets per share: convertToAssets(1 share) scaled out of the asset's decimals. A
        // finite apyBase already implies this read succeeded and is positive.
        pricePerShare: sharePrice[i] / 10 ** arm.assetDecimals[0],
        underlyingTokens: [arm.assets[0]],
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
