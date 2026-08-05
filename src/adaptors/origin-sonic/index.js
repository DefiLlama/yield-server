/*
 * Origin Sonic: OS, a rebasing LST backed by wrapped Sonic.
 *
 * TVL and APY come from Origin's production squid, so this pool carries the numbers Origin
 * reports itself. The APY replaces a day-over-day wOS exchange-rate delta, which needed two
 * block-height lookups and annualised a single noisy day.
 */
const sdk = require('@defillama/sdk');
const { gql, request } = require('graphql-request');

const { getPriceApiData } = require('../utils');
const { onChainApy } = require('../origin-ether/otokenApy');

const WRAPPED_ORIGIN_SONIC = '0x9F0dF7799f6FDAd409300080cfF680f5A23df4b1';
const ORIGIN_SONIC = '0xb1e25689d55734fd3fffc939c4c3eb52dff8a794';
const SONIC = '0x0000000000000000000000000000000000000000';
const PRICE_KEY = `sonic:${SONIC}`;

const graphUrl = 'https://origin.squids.live/origin-squid/graphql';

const exchangeRateAbi =
  'function convertToAssets(uint256 shares) view returns (uint256 assets)';

const statsQuery = gql`
  query OsStats {
    protocolDailyStatDetails(
      limit: 1
      orderBy: date_DESC
      where: { product_eq: "OS" }
    ) {
      tvl
      rateETH
    }
  }
`;

const apy = async () => {
  const [stats, priceData, apyBase, exchangeRate] = await Promise.all([
    request(graphUrl, statsQuery),
    getPriceApiData(`/prices/current/${PRICE_KEY}`),
    onChainApy('sonic', ORIGIN_SONIC),
    sdk.api.abi.call({
      target: WRAPPED_ORIGIN_SONIC,
      chain: 'sonic',
      abi: exchangeRateAbi,
      params: ['1000000000000000000'],
    }),
  ]);

  const row = stats.protocolDailyStatDetails[0];
  if (!row) return [];

  // Product rows report `tvl` in ETH; `rateETH` is S's price in ETH, so this recovers the
  // S-denominated amount and avoids valuing a Sonic product through the ETH price.
  const tvlSonic = Number(row.tvl) / Number(row.rateETH);
  const tvlUsd = tvlSonic * priceData.coins[PRICE_KEY].price;
  const pricePerShare = Number(exchangeRate.output) / 1e18;

  // Emit nothing rather than a partial pool: a failed archive read just means no sample this
  // run, and the next one picks it up.
  if (!Number.isFinite(tvlUsd) || !Number.isFinite(apyBase)) return [];

  return [
    {
      pool: ORIGIN_SONIC,
      chain: 'Sonic',
      project: 'origin-sonic',
      symbol: 'OS',
      tvlUsd,
      apyBase,
      underlyingTokens: [SONIC],
      token: ORIGIN_SONIC,
      isIntrinsicSource: true,
      ...(pricePerShare > 0 && { pricePerShare }),
    },
  ];
};

module.exports = {
  protocolId: '5688',
  timetravel: false,
  apy,
  // OS has no product page of its own any more, so this points at the site root rather than the
  // old /os path, which now serves a soft 404.
  url: 'https://www.originprotocol.com',
};
