/*
 * Base APY for an Origin OToken (OETH, superOETHb, OUSD, OS), read on-chain.
 *
 * An OToken's rebasing multiplier is 1 / rebasingCreditsPerToken, so the ratio of that value
 * across a window is exactly what the token rebased over it -- the realised base yield, taken
 * straight off the token with no vault or AMO accounting involved.
 *
 * Shared by the origin-* adaptors. This is base yield only -- the rebase does not carry Merkl
 * incentives, which are reported separately as `apyReward` where they apply.
 *
 * It reads ~0.2pp above the squid's `apy7DayAvg` because that average includes the in-progress
 * day, whose yield is annualised over a full day regardless of how much of it has actually
 * elapsed (origin-squid `docs/fix-apy-window.md`). Measuring a real elapsed window avoids that.
 */
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const CREDITS_ABI = 'uint256:rebasingCreditsPerTokenHighres';
const WINDOW_DAYS = 7;
const DAY_SECONDS = 86400;

const creditsAt = (chain, token, block) =>
  sdk.api.abi.call({ chain, target: token, abi: CREDITS_ABI, block });

// Returns null if the window can't be read, so callers can fall back rather than drop the pool.
const onChainApy = async (chain, token) => {
  try {
    const now = Math.floor(Date.now() / 1000);
    const then = now - WINDOW_DAYS * DAY_SECONDS;

    const [blockNow, blockThen] = await Promise.all([
      utils.getPriceApiData(`/block/${chain}/${now}`),
      utils.getPriceApiData(`/block/${chain}/${then}`),
    ]);

    const [creditsNow, creditsThen] = await Promise.all([
      creditsAt(chain, token, blockNow.height),
      creditsAt(chain, token, blockThen.height),
    ]);

    // Credits per token only falls as the token rebases up, so this ratio is >= 1.
    const ratio = Number(creditsThen.output) / Number(creditsNow.output);
    if (!(ratio > 0)) return null;

    return (ratio ** (365 / WINDOW_DAYS) - 1) * 100;
  } catch (e) {
    return null;
  }
};

module.exports = { onChainApy };
