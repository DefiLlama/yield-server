const sdk = require('@defillama/sdk');
const utils = require('../utils');

const PROJECT = 'hyperhive';
const CHAIN = 'hyperliquid';

const MARKET_HUB = '0xDD0CD3c660C8bcFC48B4d02f405fAa5d9D13099C';
const APP_URL = 'https://hyperhive.finance';

const GET_MARKETS_ABI =
  'function getMarkets() view returns ((uint256 marketId, address market, address asset, uint8 assetDecimals, uint8 shareDecimals, bool enabled, bool miningEnabled, uint256 totalAssets, uint256 totalSupply, uint256 totalRewardsAccrued, uint256 apyBps, uint256 exchangeRate)[] result)';

/**
 * Converts an integer token amount into a JavaScript number.
 * Precision is sufficient for TVL and APY display values.
 */
const formatUnitsNumber = (value, decimals) => {
  const raw = BigInt(value).toString();

  if (decimals === 0) {
    return Number(raw);
  }

  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals);

  return Number(`${whole}.${fraction}`);
};

const apy = async () => {
  const marketsResult = await sdk.api.abi.call({
    target: MARKET_HUB,
    abi: GET_MARKETS_ABI,
    chain: CHAIN,
  });

  const markets = marketsResult.output;

  if (markets.length === 0) {
    return [];
  }
  const assets = [
    ...new Set(markets.map((market) => market.asset.toLowerCase())),
  ];

  const [{ pricesByAddress }, symbolsResult] = await Promise.all([
    utils.getPrices(assets, CHAIN),

    sdk.api.abi.multiCall({
      calls: assets.map((asset) => ({
        target: asset,
      })),
      abi: 'erc20:symbol',
      chain: CHAIN,
    }),
  ]);

  const symbolsByAddress = Object.fromEntries(
    assets.map((asset, index) => [asset, symbolsResult.output[index].output])
  );

  return markets
    .map((market) => {
      const marketAddress = market.market;
      const assetAddress = market.asset.toLowerCase();
      const assetDecimals = Number(market.assetDecimals);

      const assetPrice = pricesByAddress[assetAddress];

      if (!Number.isFinite(assetPrice) || assetPrice <= 0) {
        return null;
      }

      const totalAssets = formatUnitsNumber(market.totalAssets, assetDecimals);

      const pricePerShare = formatUnitsNumber(
        market.exchangeRate,
        assetDecimals
      );

      /*
       * apyBps represents the market's minimum annualized rate.
       * No additional compounding assumption is applied because settlement
       * frequency is not fixed.
       */
      const apyBase = Number(market.apyBps) / 100;

      return {
        pool: `${marketAddress}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: symbolsByAddress[assetAddress],
        tvlUsd: totalAssets * assetPrice,
        apyBase,
        pricePerShare,
        underlyingTokens: [market.asset],
        token: marketAddress,
        poolMeta: 'HyperHive Market',
        url: `${APP_URL}/markets/${marketAddress}`,
      };
    })
    .filter(Boolean)
    .filter(utils.keepFinite);
};

module.exports = {
  timetravel: false,
  apy,
  url: `${APP_URL}/markets`,
};
