const axios = require('axios');
const { getStakePoolInfo } = require('../utils');

const STKESOL_MINT = 'stke7uu3fXHsGqKVVjKnkmj65LRPVrqr4bLG2SJg7rh';
const STAKE_POOL = 'StKeDUdSu7jMSnPJ1MPqDnk3RdEwD2QbJaisHMebGhw';
const SOL = 'So11111111111111111111111111111111111111112';

const stkesolKey = `solana:${STKESOL_MINT}`;
const solKey = `solana:${SOL}`;

// Calculate APY from exchange rate growth over 30 days (or available history)
const calculateApy = async (currentExchangeRate) => {
  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60;

  // Try 30-day window first
  const historicalRes = await axios.get(
    `https://coins.llama.fi/prices/historical/${thirtyDaysAgo}/${stkesolKey},${solKey}`
  );

  let stkePrice = historicalRes.data.coins[stkesolKey]?.price;
  let solPrice = historicalRes.data.coins[solKey]?.price;
  let days = 30;

  // Fall back to first recorded price if < 30 days of history
  if (!stkePrice || !solPrice) {
    const firstRes = await axios.get(
      `https://coins.llama.fi/prices/first/${stkesolKey}`
    );
    const firstData = firstRes.data.coins[stkesolKey];
    if (!firstData?.timestamp) return null;

    const solAtFirstRes = await axios.get(
      `https://coins.llama.fi/prices/historical/${firstData.timestamp}/${solKey}`
    );

    stkePrice = firstData.price;
    solPrice = solAtFirstRes.data.coins[solKey]?.price;
    days = (now - firstData.timestamp) / 86400;

    if (!solPrice || days < 7) return null;
  }

  const historicalRatio = stkePrice / solPrice;
  const ratioChange = currentExchangeRate / historicalRatio;

  return (Math.pow(ratioChange, 365 / days) - 1) * 100;
};

const apy = async () => {
  const [stakePool, priceRes] = await Promise.all([
    getStakePoolInfo(STAKE_POOL),
    axios.get(`https://coins.llama.fi/prices/current/${solKey}`),
  ]);

  const solPrice = priceRes.data.coins[solKey]?.price;
  if (!solPrice) throw new Error('Unable to fetch SOL price');

  return [
    {
      pool: STKESOL_MINT,
      chain: 'Solana',
      project: 'stkesol-by-sol-strategies',
      symbol: 'STKESOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase: await calculateApy(stakePool.exchangeRate),
      underlyingTokens: [SOL],
      poolMeta: '5% epoch fee, 0.1% withdrawal fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.solstrategies.io',
};
