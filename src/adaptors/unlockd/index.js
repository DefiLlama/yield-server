const sdk = require('@defillama/sdk');
const { UiPoolDataProviderABI } = require('./abis');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const RAY = '1000000000000000000000000000';
const SECONDS_PER_YEAR = 31536000;

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

  const pools = simpleReservesData.map((d) => {
    return {
      pool: d.underlyingAsset,
      chain: utils.formatChain('ethereum'),
      project: 'Unlockd',
      symbol: utils.formatSymbol(d.symbol),
      tvlUsd: reserveBalances[d.underlyingAsset].toNumber(),
      apyBase: calculateApy(d.liquidityRate),
      apyBaseBorrow: calculateApy(d.variableBorrowRate),
      totalSupplyUsd: reserveBalances[d.underlyingAsset]
        .plus(reserveBorrows[d.underlyingAsset])
        .toNumber(),
      totalBorrowUsd: reserveBorrows[d.underlyingAsset].toNumber(),
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.unlockd.finance/earn', // Mainnet DApp Address
};
