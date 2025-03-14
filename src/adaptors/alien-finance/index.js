const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abis = require('./alien-finance.json');

const alien = '0x50454acC07bf8fC78100619a1b68e9E8d28cE022';
const lens = '0xF090b119b10FE4aF048B3EAEB9c0d4821CaBcD30';
const chain = utils.formatChain('blast');
const project = 'alien-finance';

const calculateApy = (ratesPerSec) => {
  const secondsPerDay = 86400;
  const daysPerYear = 365;

  return (
    (Math.pow((ratesPerSec / 10 ** 18) * secondsPerDay + 1, daysPerYear) - 1) *
    100
  );
};

const apy = async () => {
  const allMarketsMetadata = (
    await sdk.api.abi.call({
      target: lens,
      abi: abis.find((m) => m.name === 'getAllMarketsMetadata'),
      params: [alien],
      chain: 'blast',
    })
  ).output;

  const allMarketsStatus = (
    await sdk.api.abi.call({
      target: lens,
      abi: abis.find((m) => m.name === 'getAllMarketsStatus'),
      params: [alien],
      chain: 'blast',
    })
  ).output;

  const pools = allMarketsMetadata.map((marketMetadata, i) => {
    const marketStatus = allMarketsStatus[i];

    const pool = `${marketMetadata.aTokenAddress}-${chain}`.toLowerCase();
    const symbol = marketMetadata.marketSymbol;
    const decimals = marketMetadata.marketDecimals;
    const price = marketStatus.marketPrice / 10 ** 18;
    const tvlUsd = (marketStatus.totalCash / 10 ** decimals) * price;
    const apyBase = calculateApy(marketStatus.supplyRate);
    const underlyingTokens = [marketStatus.market];
    const apyBaseBorrow = calculateApy(marketStatus.borrowRate);
    const totalSupplyUsd = (marketStatus.totalSupply / 10 ** decimals) * price;
    const totalBorrowUsd = (marketStatus.totalBorrow / 10 ** decimals) * price;
    const ltv = marketMetadata.collateralFactor / 10 ** 4;

    return {
      pool,
      chain,
      project,
      symbol,
      tvlUsd,
      apyBase,
      underlyingTokens,
      apyBaseBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      ltv,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.alien.finance/',
};
