const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'hyperliquid';
const DAY = 86400;
const YEAR = 365 * DAY;

const USDC = '0xb88339CB7199b77E23DB6E890353E22632Ba630f';
const USDT0 = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb';

// exchangeRate is underlying per share with 8 decimals, net of the performance fee
const RATE_DECIMALS = 8;

const pricerParamsAbi =
  'function pricerParams() view returns (address feeRecipient, uint96 highwaterMark, uint128 feesAccumulatedInBaseAsset, uint256 totalSharesLastUpdate, uint96 exchangeRate, uint16 allowedExchangeRateChangeUpper, uint16 allowedExchangeRateChangeLower, uint64 lastUpdateTimestamp, uint24 minimumUpdateDelayInSeconds, uint16 managementFee, uint16 performanceFee)';

const vaults = [
  {
    symbol: 'USDC',
    poolMeta: 'USD+',
    vault: '0x9065E3153B1393Bb5f76520cdc1e08E49eb04B03',
    pricer: '0x5362454e5648C6Ac7F03969E8a62CFc61F99b9D6',
    // the pricer's base asset: the exchange rate and withdrawals are in USDC
    underlying: USDC,
    depositTokens: [USDC, USDT0],
    shareDecimals: 6,
    url: 'https://app.hyperbeat.org/earn',
  },
];

const getPricerParams = async (pricer, block) => {
  const { output } = await sdk.api.abi.call({
    target: pricer,
    abi: pricerParamsAbi,
    chain: CHAIN,
    block,
  });
  return {
    rate: Number(output.exchangeRate),
    updatedAt: Number(output.lastUpdateTimestamp),
  };
};

// The exchange rate is updated at irregular intervals, from a few hours to
// several days apart, so a fixed lookback window holds a varying amount of
// accrual. Annualise over the time between the two rate updates instead of
// over the window length.
const annualize = (now, prior) => {
  const elapsed = now.updatedAt - prior.updatedAt;
  if (elapsed <= 0 || prior.rate <= 0) return null;
  return ((now.rate / prior.rate) ** (YEAR / elapsed) - 1) * 100;
};

const apy = async () => {
  const timestamp = Math.floor(Date.now() / 1000);
  const [block7d] = await utils.getBlocksByTime([timestamp - 7 * DAY], CHAIN);

  const priceKeys = [...new Set(vaults.map((v) => `${CHAIN}:${v.underlying}`))];
  const prices = (
    await utils.getPriceApiData(`/prices/current/${priceKeys.join(',')}`)
  ).coins;

  const pools = await Promise.all(
    vaults.map(async (v) => {
      const [totalSupply, now, prior] = await Promise.all([
        sdk.api.abi.call({
          target: v.vault,
          abi: 'erc20:totalSupply',
          chain: CHAIN,
        }),
        getPricerParams(v.pricer),
        getPricerParams(v.pricer, block7d),
      ]);

      const pricePerShare = now.rate / 10 ** RATE_DECIMALS;
      const underlyingPrice = prices[`${CHAIN}:${v.underlying}`]?.price;
      const tvlUsd =
        (Number(totalSupply.output) / 10 ** v.shareDecimals) *
        pricePerShare *
        underlyingPrice;
      const apyBase7d = annualize(now, prior);

      return {
        pool: `${v.vault}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: 'hyperbeat-earn',
        symbol: v.symbol,
        tvlUsd,
        apyBase: apyBase7d,
        apyBase7d,
        pricePerShare,
        underlyingTokens: v.depositTokens,
        token: v.vault,
        poolMeta: v.poolMeta,
        url: v.url,
      };
    })
  );

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '6107',
  timetravel: false,
  apy,
  url: 'https://app.hyperbeat.org/earn',
};
