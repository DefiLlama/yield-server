const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abis = require('./rho-markets.json');
const ethers = require('ethers');

const markets_state = '0x5FcDf2257d240Ed53459fAb752E7738e1eF4FA3F';
const chain = utils.formatChain('Scroll');
const project = 'rho-markets';

function calculateApy(supplyRatePerBlock, blocksPerYear) {
  supplyRatePerBlock = BigInt(supplyRatePerBlock);
  blocksPerYear = BigInt(blocksPerYear);

  if (supplyRatePerBlock === 0n) return 0;

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

  const compounded = pow(SCALE + supplyRatePerBlock, blocksPerYear);
  const rawData = (compounded - SCALE) * 100n;

  const data = ethers.utils.formatEther(rawData.toString());
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
    const tvlUsd = Number(ethers.utils.formatEther(marketInfo.tvl.toString()));
    const ltv = Number(ethers.utils.formatEther(marketInfo.ltv.toString()));
    const totalSupplyUsd = Number(
      ethers.utils.formatEther(marketInfo.totalSupply.toString())
    );
    const totalBorrowUsd = Number(
      ethers.utils.formatEther(marketInfo.totalBorrows.toString())
    );

    const supplyRatePerBlock = marketInfo.supplyRatePerBlock;
    const borrowRatePerBlock = marketInfo.borrowRatePerBlock;
    const blocksPerYear = marketInfo.blocksPerYear;

    const apyBase = calculateApy(supplyRatePerBlock, blocksPerYear);
    const apyBaseBorrow = calculateApy(borrowRatePerBlock, blocksPerYear);

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
