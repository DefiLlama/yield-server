const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');
const ethers = require('ethers');

const Addresses = {
  lens: '0xeA62e3a2D5FE8D5b66dc8E1bd2405AD23C851f4e',
  ethena: {
    cdo: '0x908B3921aaE4fC17191D382BB61020f2Ee6C0e20',
    srUSDe: '0x3d7d6fdf07EE548B939A80edbc9B2256d0cdc003',
    jrUSDe: '0xC58D044404d8B14e953C115E67823784dEA53d8F',
  },
};

const getTotalSupply = async (tokenAddress, chain = 'ethereum') => {
  try {
    const { output } = await sdk.api.abi.call({
      target: tokenAddress,
      abi: 'erc20:totalSupply',
      chain,
    });
    return output / 1e18;
  } catch (error) {
    console.error(`Error fetching total supply for ${tokenAddress}:`, error);
    throw error;
  }
};

const getTokenPrice = async (tokenAddress) => {
  try {
    const priceKey = `ethereum:${tokenAddress}`;
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${priceKey}`
    );
    return data.coins[priceKey].price;
  } catch (error) {
    console.error(`Error fetching price for ${tokenAddress}:`, error);
    throw error;
  }
};

const getAprs = async (cdoAddress, chain = 'ethereum') => {
  try {
    const { output } = await sdk.api.abi.call({
      target: Addresses.lens,
      abi: 'function getAPRs(address cdo) external view returns (int64 base, int64 target, int64 jrt, int64 srt)',
      params: [cdoAddress],
      chain,
      block: 'latest',
    });
    let [base, target, jrt, srt] = output;
    return {
      jrt: Number(jrt) / 1e10,
      srt: Number(srt) / 1e10,
    };
  } catch (error) {
    console.error(`Error fetching total supply for ${cdoAddress}:`, error);
    throw error;
  }
};

async function loadPool(tranche, symbol) {
  const cdo = Addresses[tranche].cdo;
  const vault = Addresses[tranche][symbol];

  const [totalSupply, price, aprs] = await Promise.all([
    getTotalSupply(vault),
    getTokenPrice(vault),
    getAprs(cdo),
  ]);

  const apy = utils.aprToApy(symbol.startsWith('sr') ? aprs.srt : aprs.jrt);
  return {
    pool: vault,
    symbol: symbol,
    chain: 'ethereum',
    project: 'strata-tranches',
    tvlUsd: totalSupply * price,
    apyBase: apy,
  };
}

const apy = async () => {
  try {
    return await Promise.all([
      loadPool('ethena', 'srUSDe'),
      loadPool('ethena', 'jrUSDe'),
    ]);
  } catch (error) {
    console.error('Error fetching APYs:', error);
    throw error;
  }
};

module.exports = {
  apy,
  url: 'https://strata.money/',
};
