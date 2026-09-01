const { COMMON_CONFIG } = require('../constants');

/**
 * Check if rewards are currently active
 */
function isRewardActive(periodFinish, queuedRewards) {
  const now = Math.floor(Date.now() / 1000);
  let finish = parseInt(periodFinish || '0', 10);

  if (queuedRewards && BigInt(queuedRewards) > 0n) {
    finish += COMMON_CONFIG.QUEUED_REWARDS_EXTENSION;
  }

  return finish > now;
}

module.exports = {
  isRewardActive,
};
