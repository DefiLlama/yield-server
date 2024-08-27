const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abis = require('./rho-markets.json');
const ethers = require('ethers');

const markets_state = '0x82aD747C39977891B43d46Ee0b8fC2d29F1008b1';
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
    const tvlUsd = Number(ethers.utils.formatEther(marketInfo.tvl.toString()));

    const supplyRatePerBlock = marketInfo.supplyRatePerBlock;
    const blocksPerYear = marketInfo.blocksPerYear;

    const apyBase = calculateApy(supplyRatePerBlock, blocksPerYear);

    const underlyingSymbol = marketInfo.underlyingSymbol;
    const url = `https://dapp.rhomarkets.xyz/market/${underlyingSymbol}`;

    return {
      pool,
      chain,
      project,
      tvlUsd,
      apyBase,
      symbol: underlyingSymbol,
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
