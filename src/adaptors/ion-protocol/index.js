const utils = require('../utils');
const sdk = require('@defillama/sdk');

const ionAbi = {
  usd: 'int256:latestAnswer',
  debt: 'function debt(address pool) external view returns (uint256)',
  lenderExchangeRate: 'uint256:stEthPerToken',
  totalSupply: 'uint256:totalSupply',
  marketBorrowRate:
    'function getCurrentBorrowRate(uint8 ilkIndex) external view returns (uint256 borrowRate, uint256 reserveFactor)',
};

const apy = async () => {
  const markets = await utils.getData(
    'https://ion-backend.vercel.app/v1/bigbrother/markets'
  );

  const usdExchangeRate =
    (
      await sdk.api.abi.call({
        target: '0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8', // chainlink stEth/USD
        abi: ionAbi.usd,
        chain: 'ethereum',
      })
    ).output / 1e8;

  const debt = (
    await sdk.api.abi.multiCall({
      calls: markets.map((i) => ({
        target: i.ionLens,
        params: i.ionPool,
      })),
      abi: ionAbi.debt,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: markets.map((i) => ({
        target: i.ionPool,
      })),
      abi: ionAbi.totalSupply,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const lenderAssetExchangeRate = (
    await sdk.api.abi.multiCall({
      calls: markets.map((i) => ({
        target: i.lenderAssetAddress,
      })),
      abi: ionAbi.lenderExchangeRate,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const borrowRate = (
    await sdk.api.abi.multiCall({
      calls: markets.map((i) => ({
        target: i.ionPool,
        params: 0,
      })),
      abi: ionAbi.marketBorrowRate,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const pools = markets.map((market, i) => {
    const totalSupplyUsd =
      (totalSupply[i] / 1e18) *
      (lenderAssetExchangeRate[i] / 1e18) *
      usdExchangeRate;
    const totalBorrowUsd =
      (debt[i] / 1e45) * (lenderAssetExchangeRate[i] / 1e18) * usdExchangeRate;
    const ltv = debt[i] / 1e45 / (totalSupply[i] / 1e18);
    const borrowRateYearly = (borrowRate[i].borrowRate / 1e27) ** 31536000;
    const marketApy = (borrowRateYearly - 1) * ltv * 100;

    return {
      pool: market.ionPool,
      chain: 'ethereum',
      project: 'ion-protocol',
      symbol: market.collateralAssetName + '-' + market.lenderAssetName,
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: marketApy,
      underlyingTokens: [market.lenderAssetAddress],
      totalSupplyUsd: totalSupplyUsd,
      totalBorrowUsd: totalBorrowUsd,
      ltv: ltv,
    };
  });
  return pools;
};

module.exports = {
  apy,
  url: 'https://www.app.ionprotocol.io/',
};
