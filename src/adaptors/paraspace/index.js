const superagent = require('superagent');
const utils = require('../utils');
const BigNumber = require('bignumber.js');
const sdk = require('@defillama/sdk');
const address = require('./address');
const { UiPoolDataProvider } = require('./abi');
const { calculateAPY } = require('./utils');

const chain = 'ethereum';
const { UiPoolDataProvider: uiPool, PoolAddressProvider } = address[chain];

const apy = async () => {
  const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const ethPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  const [reservesData] = (
    await sdk.api.abi.call({
      target: uiPool,
      abi: UiPoolDataProvider.getReservesData,
      params: PoolAddressProvider,
      chain,
    })
  ).output;

  const pools = reservesData
    .filter(
      (reserve) =>
        reserve.assetType === '0' &&
        reserve.underlyingAsset !== '0x0000000000000000000000000000000000000001'
    )
    .map((reserve, index) => {
      const tvlUsd = new BigNumber(reserve.availableLiquidity)
        .multipliedBy(reserve.priceInMarketReferenceCurrency)
        .multipliedBy(ethPriceUSD)
        .shiftedBy(-(18 + Number(reserve.decimals)))
        .toNumber();
      const totalBorrowUsd = new BigNumber(reserve.totalScaledVariableDebt)
        .multipliedBy(reserve.variableBorrowIndex)
        .multipliedBy(reserve.priceInMarketReferenceCurrency)
        .multipliedBy(ethPriceUSD)
        .shiftedBy(-(18 + 27 + Number(reserve.decimals)))
        .toNumber();
      const totalSupplyUsd = tvlUsd + totalBorrowUsd;
      return {
        pool: `${reserve.xTokenAddress}-${chain}`.toLowerCase(),
        chain: 'Ethereum',
        project: 'paraspace',
        symbol: reserve.symbol,
        tvlUsd,
        apyBase: calculateAPY(reserve.liquidityRate).toNumber() * 100,
        underlyingTokens: [reserve.underlyingAsset],
        totalSupplyUsd,
        totalBorrowUsd,
        apyBaseBorrow:
          calculateAPY(reserve.variableBorrowRate).toNumber() * 100,
        ltv: reserve.baseLTVasCollateral / 10000,
        url: `https://app.para.space/`,
        borrowable: reserve.borrowingEnabled,
      };
    });

  return pools;
};
module.exports = {
  timetravel: false,
  apy: apy,
};
