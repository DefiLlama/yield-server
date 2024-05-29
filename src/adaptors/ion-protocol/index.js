const utils = require('../utils');
const sdk = require('@defillama/sdk5');

const ionAbi = {
  usd: 'int256:latestAnswer',
  debt: 'function debt(address pool) external view returns (uint256)',
  lenderExchangeRate: 'uint256:stEthPerToken',
  totalSupply: 'uint256:totalSupply',
  marketBorrowRate:
    'function getCurrentBorrowRate(uint8 ilkIndex) external view returns (uint256 borrowRate, uint256 reserveFactor)',
};

const marketApy = async () => {
  const markets = await utils.getData(
    'https://ion-backend.vercel.app/v1/bigbrother/markets'
  );
  let pools = [];
  for (let market of markets) {
    const debt = await sdk.api.abi.call({
      target: market.ionLens,
      abi: ionAbi.debt,
      params: market.ionPool,
      chain: 'ethereum',
    });
    const totalSupply = await sdk.api.abi.call({
      target: market.ionPool,
      abi: ionAbi.totalSupply,
      chain: 'ethereum',
    });
    const usdExchangeRate = await sdk.api.abi.call({
      target: '0xCfE54B5cD566aB89272946F602D76Ea879CAb4a8', // chainlink stEth/USD
      abi: ionAbi.usd,
      chain: 'ethereum',
    });
    const lenderAssetExchangeRate = await sdk.api.abi.call({
      target: market.lenderAssetAddress,
      abi: ionAbi.lenderExchangeRate,
      chain: 'ethereum',
    });
    const borrowRate = await sdk.api.abi.call({
      target: market.ionPool,
      abi: ionAbi.marketBorrowRate,
      params: 0,
      chain: 'ethereum',
    });
    const totalSupplyUsd =
      (totalSupply.output / 1e18) *
      (lenderAssetExchangeRate.output / 1e18) *
      (usdExchangeRate.output / 1e8);
    const totalBorrowUsd =
      (debt.output / 1e45) *
      (lenderAssetExchangeRate.output / 1e18) *
      (usdExchangeRate.output / 1e8);
    const ltv = debt.output / 1e45 / (totalSupply.output / 1e18);
    const borrowRateYearly = (borrowRate.output.borrowRate / 1e27) ** 31536000;
    const marketApy = (borrowRateYearly - 1) * ltv * 100;

    const pool = {
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
    pools.push(pool);
  }
  return pools;
};

const apy = async () => {
  const pools = await marketApy();
  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.app.ionprotocol.io/',
};
