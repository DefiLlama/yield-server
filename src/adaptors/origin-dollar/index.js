/*
 * Origin Dollar: OUSD.
 *
 * TVL comes from Origin's production squid. `protocolDailyStatDetails.tvl` is the backing that
 * belongs to holders: it nets out the OUSD the vault's own Curve AMO minted into the pool, which
 * is protocol-owned liquidity rather than depositor funds. That runs ~11% below OUSD's total
 * supply, which is what a naive totalSupply x price reports.
 */
const { gql, request } = require('graphql-request');

const utils = require('../utils');
const { onChainApy } = require('../origin-ether/otokenApy');

const OUSD = '0x2A8e1E676Ec238d8A992307B495b45B3fEAa5e86';
const PRICE_KEY = `ethereum:${OUSD}`;

const graphUrl = 'https://origin.squids.live/origin-squid/graphql';

const statsQuery = gql`
  query OusdStats {
    protocolDailyStatDetails(
      limit: 1
      orderBy: date_DESC
      where: { product_eq: "OUSD" }
    ) {
      tvl
      rateETH
    }
  }
`;

const apy = async () => {
  const [stats, priceData, apyBase] = await Promise.all([
    request(graphUrl, statsQuery),
    utils.getPriceApiData(`/prices/current/${PRICE_KEY}`),
    onChainApy('ethereum', OUSD),
  ]);

  const row = stats.protocolDailyStatDetails[0];
  // Product rows report `tvl` in ETH; `rateETH` is OUSD's price in ETH, so this recovers the
  // OUSD-denominated amount and avoids valuing a dollar product through the ETH price.
  const tvlOusd = Number(row.tvl) / Number(row.rateETH);
  const tvlUsd = tvlOusd * priceData.coins[PRICE_KEY].price;

  // Emit nothing rather than a partial pool: a failed archive read just means no sample this
  // run, and the next one picks it up.
  if (!Number.isFinite(tvlUsd) || !Number.isFinite(apyBase)) return [];

  return [
    {
      pool: OUSD,
      chain: 'Ethereum',
      project: 'origin-dollar',
      symbol: 'OUSD',
      tvlUsd,
      // OUSD yield is all base yield: strategy returns rebase into the token.
      apyBase,
      // The vault's only collateral asset today; it used to also hold USDT and DAI.
      underlyingTokens: ['0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
      token: OUSD,
      isIntrinsicSource: true,
      url: 'https://app.originprotocol.com/#/ousd',
    },
  ];
};

module.exports = {
  protocolId: '427',
  timetravel: false,
  apy,
};
