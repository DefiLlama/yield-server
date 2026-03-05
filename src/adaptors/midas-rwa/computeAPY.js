const { formatUnits } = require('ethers/lib/utils');

const SECONDS_PER_DAY = 86400;

function computeAPY(tokenData) {
  try {
    const current = Number(formatUnits(tokenData.currentPrice, 18));
    const historical = Number(formatUnits(tokenData.historicalPrice, 18));

    if (historical === 0) return 0;

    const growth = current / historical;
    const days =
      (tokenData.currentTimestamp - tokenData.historicalTimestamp) /
      SECONDS_PER_DAY;

    if (days <= 0) return 0;
    if (growth < 1) return 0;

    const annualizationFactor = 365 / days;
    const apy = (Math.pow(growth, annualizationFactor) - 1) * 100;

    return Number(apy.toFixed(2));
  } catch (error) {
    return 0;
  }
}

module.exports = { computeAPY };
