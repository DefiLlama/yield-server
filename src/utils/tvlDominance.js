// Dominance gate (dexs only): pools implausibly larger than their protocol siblings are
// dropped before insert. Same algorithm as yield-server-v2 src/normalize/tvlDominance.ts.

const exclude = require('./exclude');

const DOMINANCE_CATEGORY = 'dexs';
const DOMINANCE_RATIO = 10; // legit steps peak ~5.5x among >$10M pools, bogus sit at 12x+
const DOMINANCE_FLOOR_USD = 10_000_000;

// Vetted genuinely-dominant pools (lowercase); they still anchor the cliff scan.
const ALLOWED_DOMINANT_POOL_KEYS = new Set([]);

// pools: [{ pool, tvlUsd }]. Returns the pool keys to drop plus the anchor for logging.
const findTvlDominanceOutliers = ({ protocolCategory, pools }) => {
  const none = { outlierKeys: new Set(), anchorTvlUsd: null };
  // config category is "Dexs"; v2 compares the slug
  if (protocolCategory?.toLowerCase() !== DOMINANCE_CATEGORY) return none;

  const tvls = pools
    .map((p) => p.tvlUsd)
    .filter((tvl) => tvl >= exclude.boundaries.tvlUsdDB.lb)
    .sort((a, b) => b - a);

  // Deepest cliff: the largest index whose pool clears the floor and towers over the next.
  let cliffIndex = -1;
  for (let index = tvls.length - 2; index >= 0; index--) {
    if (
      tvls[index] > DOMINANCE_FLOOR_USD &&
      tvls[index] > DOMINANCE_RATIO * tvls[index + 1]
    ) {
      cliffIndex = index;
      break;
    }
  }
  if (cliffIndex === -1) return none;

  const cliffTvl = tvls[cliffIndex];
  const outlierKeys = new Set(
    pools
      .filter(
        (p) =>
          p.tvlUsd >= cliffTvl &&
          !ALLOWED_DOMINANT_POOL_KEYS.has(p.pool.toLowerCase())
      )
      .map((p) => p.pool)
  );
  return { outlierKeys, anchorTvlUsd: tvls[cliffIndex + 1] };
};

module.exports = { findTvlDominanceOutliers };
