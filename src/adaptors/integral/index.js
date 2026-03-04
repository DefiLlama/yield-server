const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const mainnetUrlSize = `https://size-api.integral.link/api/v6/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=&network=Mainnet`;
const mainnetUrlFive = `https://five-api.integral.link/api/v1/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=&network=Mainnet`;
const arbitrumUrlSize = `https://arbitrum-size-api.integral.link/api/v6/pools?apiKey=00Gfs4iNa%2FXJDBkF%2B%2FX83SRqx3MXXAngJMkpx3lM%2FTU=&network=Arbitrum`;

const chains = {
  eth: 'ethereum',
  arb: 'arbitrum',
};

// Fetch token0 and token1 from LP contract
const getPoolTokens = async (poolAddress, chain) => {
  try {
    const [token0, token1] = await Promise.all([
      sdk.api.abi.call({
        target: poolAddress,
        abi: 'address:token0',
        chain,
      }),
      sdk.api.abi.call({
        target: poolAddress,
        abi: 'address:token1',
        chain,
      }),
    ]);

    const tokens = [token0.output, token1.output].filter(
      t => t && t !== '0x0000000000000000000000000000000000000000'
    );
    return tokens.length > 0 ? tokens : undefined;
  } catch (e) {
    return undefined;
  }
};

const buildPool = (entry, chainString, version, underlyingTokens) => {
  return {
    pool: entry.address,
    chain: utils.formatChain(chainString),
    project: 'integral',
    poolMeta: version,
    symbol: entry.name.toUpperCase(),
    tvlUsd: parseFloat(BigNumber(entry.totalTokenValue).div(10 ** 18)),
    apyBase: entry.swapApr ? parseFloat(BigNumber(entry.swapApr).div(10 ** 18).times(100)) : 0,
    apyReward: entry.lpRewardApr ? parseFloat(BigNumber(entry.lpRewardApr).div(10 ** 18).times(100)) : 0,
    underlyingTokens,
  };
};

const topLvl = async (chainString, url, version) => {
  const data = await utils.getData(url);

  // Fetch underlying tokens for all pools in parallel
  const poolsWithTokens = await Promise.all(
    data.data.map(async (entry) => {
      const underlyingTokens = await getPoolTokens(entry.address, chainString);
      return buildPool(entry, chainString, version, underlyingTokens);
    })
  );

  return poolsWithTokens;
};

const main = async () => {
  const data = await Promise.all([
    topLvl(chains.eth, mainnetUrlSize, 'SIZE'),
    topLvl(chains.eth, mainnetUrlFive, 'FIVE'),
    topLvl(chains.arb, arbitrumUrlSize, 'SIZE'),
  ]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://size.integral.link/pools',
};
