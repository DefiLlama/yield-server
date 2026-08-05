/*
 * Origin Ether: OETH (Ethereum) and superOETHb (Base).
 *
 * Both TVL and APY come from Origin's production squid, so these pools carry the same numbers
 * Origin reports itself.
 *
 * `protocolDailyStatDetails.tvl` is the backing that belongs to holders: it nets out the OToken
 * the vault's own AMO strategies minted into Curve/Aerodrome pools, which is protocol-owned
 * liquidity rather than depositor funds. Raw `vault.totalValue()` includes it and puts
 * superOETHb at ~$29M against ~$19M of holder-owned backing.
 *
 * This is deliberately not Origin Ether's protocol TVL on DefiLlama, which on Base also drops
 * the bridged wOETH strategy (~8.4k WETH, the row's `bridgedTvl`) because that backing is
 * already counted on Ethereum. Netting it out is right for protocol TVL, but wrong for pool
 * size -- the bridged wOETH is precisely what backs superOETHb holders' balances.
 */
const { gql, request } = require('graphql-request');

const utils = require('../utils');
const { onChainApy } = require('./otokenApy');

const ETHEREUM_OETH_TOKEN = '0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3';
const BASE_SUPER_OETH_TOKEN = '0xDBFeFD2e8460a6Ee4955A68582F85708BAEA60A3';

const NATIVE_ETH = '0x0000000000000000000000000000000000000000';
const ETH_PRICE_KEY = `ethereum:${NATIVE_ETH}`;

const graphUrl = 'https://origin.squids.live/origin-squid/graphql';

const PRODUCTS = [
  {
    product: 'OETH',
    symbol: 'OETH',
    chain: 'Ethereum',
    sdkChain: 'ethereum',
    token: ETHEREUM_OETH_TOKEN,
    url: 'https://app.originprotocol.com/#/oeth',
  },
  {
    product: 'superOETHb',
    symbol: 'superOETHb',
    chain: 'Base',
    sdkChain: 'base',
    token: BASE_SUPER_OETH_TOKEN,
    url: 'https://app.originprotocol.com/#/super',
  },
];

const statsQuery = gql`
  query ProductStats($product: String!) {
    protocolDailyStatDetails(
      limit: 1
      orderBy: date_DESC
      where: { product_eq: $product }
    ) {
      tvl
      rateETH
    }
  }
`;

const fetchPoolData = async ({ product, symbol, chain, sdkChain, token, url }, ethPrice) => {
  const [stats, apyBase] = await Promise.all([
    request(graphUrl, statsQuery, { product }),
    onChainApy(sdkChain, token),
  ]);

  const row = stats.protocolDailyStatDetails[0];
  // `tvl` is denominated in ETH on every product row, so it converts straight through the ETH
  // price. (`rateETH` is 1 for the ETH-denominated products; dividing keeps this correct if a
  // future product is denominated in something else.)
  const tvlEth = Number(row?.tvl) / Number(row?.rateETH);

  return {
    pool: token,
    chain,
    project: 'origin-ether',
    symbol,
    tvlUsd: tvlEth * ethPrice,
    // OToken yield is all base yield: the vault's strategy returns rebase into the token.
    apyBase,
    underlyingTokens: [NATIVE_ETH],
    token,
    searchTokenOverride: token,
    isIntrinsicSource: true,
    url,
  };
};

const apy = async () => {
  const ethPrice = (
    await utils.getPriceApiData(`/prices/current/${ETH_PRICE_KEY}`)
  ).coins[ETH_PRICE_KEY].price;

  const pools = await Promise.allSettled(
    PRODUCTS.map((p) => fetchPoolData(p, ethPrice))
  );

  return pools
    .filter((i) => i.status === 'fulfilled')
    .map((i) => i.value)
    .filter((p) => Number.isFinite(p.tvlUsd) && Number.isFinite(p.apyBase));
};

module.exports = {
  protocolId: '2950',
  timetravel: false,
  apy,
  url: 'https://originprotocol.com',
};
