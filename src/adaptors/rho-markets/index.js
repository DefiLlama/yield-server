const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abis = require('./rho-markets.json');
const ethers = require('ethers');

const markets_state = '0xeF7ceDe2D4E053ccf2A58f977a1F1eDC8782Ecc5';
const chain = utils.formatChain('Scroll');
const project = 'rho-markets';

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
      chain: 'scroll',
    })
  ).output;

  const pools = allMarketsMetadata.map((marketInfo, i) => {
    const pool = `${marketInfo.token}-${chain}`.toLowerCase();
    const underlyingSymbol = marketInfo.underlyingSymbol;

    const poolMeta = `Rho ${underlyingSymbol} Market`;
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

    const url = `https://dapp.rhomarkets.xyz/market/${underlyingSymbol}`;

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
  url: 'https://dapp.rhomarkets.xyz/',
};
