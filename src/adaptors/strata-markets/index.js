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
    underlying: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3', // USDe
  },
  neutrl: {
    cdo: '0x7b6c960cf185fb27ECb91c174FAe065978beDd10',
    srNUSD: '0x65a44528e8868166401eA08b549E19552af589dB',
    jrNUSD: '0xFC807058A352b61aEef6A38e2D0fC3990225E772',
    underlying: '0xE556ABa6fe6036275Ec1f87eda296BE72C811BCE', // NUSD
  },
  mhyper: {
    cdo: '0x39C7E67b25fB14eAec8717B20664C2E35327e6cf',
    srmHYPER: '0x627EA69929212916Ec57B1b26d2E1a19F6129B53',
    jrmHYPER: '0xEb205d26E9E605Ec82d1C0d652E00037C278714b',
    underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  },
  mm1usd: {
    cdo: '0x613D1790d9BA381D27B4071C04380Db8ED120E5f',
    srmM1USD: '0xCcEd21d609CaC4A272d0c01a8FF4de9cEBc40d60',
    jrmM1USD: '0xf7eB8dfec75C42D2d2247FE76Ccaedc59f821688',
    underlying: '0xCc5C22C7A6BCC25e66726AeF011dDE74289ED203', // MM1USD
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
    pool: vault.toLowerCase(),
    symbol: symbol,
    chain: 'ethereum',
    project: 'strata-markets',
    tvlUsd: totalSupply * price,
    apyBase: apy,
    underlyingTokens: [Addresses[tranche].underlying],
  };
}

const apy = async () => {
  try {
    return await Promise.all([
      loadPool('ethena', 'srUSDe'),
      loadPool('ethena', 'jrUSDe'),
      loadPool('neutrl', 'srNUSD'),
      loadPool('neutrl', 'jrNUSD'),
      loadPool('mhyper', 'srmHYPER'),
      loadPool('mhyper', 'jrmHYPER'),
      loadPool('mm1usd', 'srmM1USD'),
      loadPool('mm1usd', 'jrmM1USD'),
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
