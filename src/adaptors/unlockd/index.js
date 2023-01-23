const sdk = require('@defillama/sdk');
const axios = require('axios');
const { UiPoolDataProviderABI } = require('./abis');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const RAY = '1000000000000000000000000000';
const SECONDS_PER_YEAR = 31536000;
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const calculateApy = (rate) => {
  const aprBase = BigNumber(rate).div(RAY).toNumber() / SECONDS_PER_YEAR + 1;

  return aprBase ** SECONDS_PER_YEAR - 1;
};

const poolsFunction = async () => {
  const reserveBalances = {};
  const reserveBorrows = {};

  const { output: simpleReservesData } = await sdk.api.abi.call({
    target: '0x2CF74101dF653E166Cbf699EeED6FaB599293BcD', // Mainnet UIDataProvider Address
    params: ['0xE6cd031FB0D9A79FD8CD3035B9228F78ff459B07'], // Mainnet LendPoolAddressProvider Address
    abi: UiPoolDataProviderABI.find((a) => a.name === 'getSimpleReservesData'),
    chain: 'ethereum',
  });
  simpleReservesData.forEach((d) => {
    reserveBalances[d.underlyingAsset] = new BigNumber(
      reserveBalances[d.underlyingAsset] || 0
    ).plus(d.availableLiquidity);
    reserveBorrows[d.underlyingAsset] = new BigNumber(
      reserveBorrows[d.underlyingAsset] || 0
    ).plus(d.totalVariableDebt);
  });

  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const pools = simpleReservesData.map((d) => {
    return {
      pool: d.underlyingAsset,
      chain: utils.formatChain('ethereum'),
      project: 'unlockd',
      symbol: utils.formatSymbol(d.symbol),
      tvlUsd: reserveBalances[d.underlyingAsset].toNumber() * ethPrice,
      apyBase: calculateApy(d.liquidityRate),
      apyBaseBorrow: calculateApy(d.variableBorrowRate),
      totalSupplyUsd:
        reserveBalances[d.underlyingAsset]
          .plus(reserveBorrows[d.underlyingAsset])
          .toNumber() * ethPrice,
      totalBorrowUsd: reserveBorrows[d.underlyingAsset].toNumber() * ethPrice,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.unlockd.finance/earn', // Mainnet DApp Address
};
