const sdk = require('@defillama/sdk');
const utils = require('../utils');

const ACRE_BTC = '0x19531C886339dd28b9923d903F6B235C45396ded';
const TBTC = '0x18084fba666a33d37592fa2633fd49a74dd93a88';
const CHAIN = 'ethereum';

// Chainlink-style aggregator that stores the vault exchange rate (8 decimals).
// Updated manually by the keeper every ~2-4 weeks.
const AGGREGATOR = '0xd0eed92db46b099f8dea366a7198b5dd249af61f';
const GET_ROUND_DATA_ABI =
  'function getRoundData(uint80 _roundId) view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)';
const LATEST_ROUND_ABI =
  'function latestRoundData() view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)';

const apy = async () => {
  const [latestRound, tvlRes, { pricesByAddress }] = await Promise.all([
    sdk.api.abi.call({
      target: AGGREGATOR,
      abi: LATEST_ROUND_ABI,
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: ACRE_BTC,
      abi: 'uint256:totalAssets',
      chain: CHAIN,
    }),
    utils.getPrices([TBTC], CHAIN),
  ]);

  const latestRate = latestRound.output.answer / 1e8;
  const latestTs = Number(latestRound.output.updatedAt);
  const latestId = Number(latestRound.output.roundId);

  // Walk back through rounds to find one at least ~30 days old
  const DAY = 86400;
  const targetTs = latestTs - 30 * DAY;
  let prevRate, prevTs;

  for (let id = latestId - 1; id >= 1; id--) {
    const round = await sdk.api.abi.call({
      target: AGGREGATOR,
      abi: GET_ROUND_DATA_ABI,
      params: [id],
      chain: CHAIN,
    });
    const ts = Number(round.output.updatedAt);
    const rate = round.output.answer / 1e8;

    // Skip rounds with identical timestamps (no real update)
    if (rate > 0) {
      prevRate = rate;
      prevTs = ts;
    }
    if (ts <= targetTs) break;
  }

  const tbtcPrice = pricesByAddress[TBTC.toLowerCase()];
  const tvlUsd = (tvlRes.output / 1e18) * tbtcPrice;

  const daysBetween = (latestTs - prevTs) / DAY;
  const apyBase =
    daysBetween > 0
      ? (latestRate / prevRate) ** (365 / daysBetween) * 100 - 100
      : 0;

  return [
    {
      pool: ACRE_BTC,
      chain: CHAIN,
      project: 'acre',
      symbol: 'tBTC',
      tvlUsd,
      apyBase,
      underlyingTokens: [TBTC],
      url: 'https://bitcoin.acre.fi/dashboard',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://bitcoin.acre.fi/dashboard',
};
