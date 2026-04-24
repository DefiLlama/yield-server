const { COMMON_CONFIG } = require('../constants');

/**
 * Calculate AURA mint amount for a given BAL amount
 */
function calculateAuraMintAmount(
  balEarned,
  globals,
  applyAip42 = COMMON_CONFIG.AIP_42_ENABLED
) {
  if (!globals?.auraTotalSupply) return '0';

  const balEarnedBN = BigInt(balEarned);
  if (balEarnedBN < 500000000000000n) return '0';

  const auraTotalSupply = BigInt(globals.auraTotalSupply);
  const auraMaxSupply = BigInt(globals.auraMaxSupply);
  const auraReductionPerCliff = BigInt(globals.auraReductionPerCliff);
  const auraTotalCliffs = BigInt(globals.auraTotalCliffs);

  const emissionsMinted = auraTotalSupply - auraMaxSupply;
  const cliff = emissionsMinted / auraReductionPerCliff;

  if (cliff >= auraTotalCliffs) return '0';

  const reduction = ((auraTotalCliffs - cliff) * 25n) / 10n + 700n;
  let amount = (balEarnedBN * reduction) / auraTotalCliffs;

  // Apply max supply limit
  const amtTillMax = auraMaxSupply - emissionsMinted;
  if (amount > amtTillMax) amount = amtTillMax;

  // Apply AIP-42 reduction (40% of original)
  if (applyAip42) amount = (amount * 4n) / 10n;

  return amount.toString();
}

module.exports = {
  calculateAuraMintAmount,
};
