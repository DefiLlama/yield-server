const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abis = require('./takara-lend.json');
const ethers = require('ethers');

const markets_state = '0x323917A279B209754B32Ab57a817c64ECfE2AF40';
const chain = utils.formatChain('Sei');
const project = 'takara-lend';

function calculateApy(ratePerSecond, compoundingsPerYear) {
  ratePerSecond = BigInt(ratePerSecond);
  compoundingsPerYear = BigInt(compoundingsPerYear);

  if (ratePerSecond === 0n) return 0;

  const SCALE = BigInt(1e18);

  function pow(base, exponent) {
    let result = SCALE;
    let basePow = base;

    while (exponent > 0n) {
      if (exponent % 2n === 1n) {
        result = (result * basePow) / SCALE;
      }
      basePow = (basePow * basePow) / SCALE;
      exponent /= 2n;
    }

    return result;
  }
  const compounded = pow(SCALE + ratePerSecond, compoundingsPerYear);
  const rawData = (compounded - SCALE) * 100n;

  const data = ethers.utils.formatEther(rawData);
  return Number(data);
}

const apy = async () => {
  const allMarketsMetadata = (
    await sdk.api.abi.call({
      target: markets_state,
      abi: abis.find((m) => m.name === 'getActiveMarketsInfo'),
      chain: 'sei',
    })
  ).output;

  const pools = allMarketsMetadata.map((marketInfo, i) => {
    const pool = `${marketInfo.token}-${chain}`.toLowerCase();
    const underlyingSymbol = marketInfo.underlyingSymbol;

    const poolMeta = `Takara Lend ${underlyingSymbol} Market`;
    const tvlUsd = Number(ethers.utils.formatEther(marketInfo.tvl));
    const ltv = Number(ethers.utils.formatEther(marketInfo.ltv));
    const totalSupplyUsd = Number(
      ethers.utils.formatEther(marketInfo.totalSupply)
    );
    const totalBorrowUsd = Number(
      ethers.utils.formatEther(marketInfo.totalBorrows)
    );

    const blocksPerYear = marketInfo.blocksPerYear;
    const borrowRatePerBlock = marketInfo.borrowRatePerBlock;
    const supplyRatePerBlock = marketInfo.supplyRatePerBlock;
    const timestampsPerYear = marketInfo.timestampsPerYear;

    const base = blocksPerYear > 0 ? blocksPerYear : timestampsPerYear;

    const apyBase = calculateApy(supplyRatePerBlock, base);

    const apyBaseBorrow = calculateApy(borrowRatePerBlock, base);

    const url = `https://app.takaralend.com/market/${underlyingSymbol}`;

    return {
      pool,
      chain,
      project,
      poolMeta,
      ltv,
      tvlUsd,
      totalSupplyUsd,
      totalBorrowUsd,
      apyBase,
      apyBaseBorrow,
      symbol: underlyingSymbol,
      underlyingTokens: [marketInfo.underlying],
      url,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.takaralend.com',
};
