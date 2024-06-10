const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const config = require('./config');

const erc20ABI = {
  decimals: 'function decimals() external pure returns (uint8)',
  balanceOf:
    'function balanceOf(address owner) external view returns (uint256 balance)',
};

const urlApy = 'https://api-v2.symbiosis.finance/farming/v1/apr';

const formatApy = (value) => {
  return new BigNumber(value).multipliedBy(100).toNumber();
};

const loadApyData = async () => {
  const apy = await utils.getData(urlApy);

  const apyData = {};
  apy.forEach((i) => {
    const pool = i['pools'][0];
    apyData[pool['chainId']] = {
      apr: formatApy(pool['apr']),
      boostedApr: formatApy(pool['boostedApr']),
    };
  });
  return apyData;
};

const loadTvlData = async () => {
  const balanceCalls = config.chains.map((i) => {
    return {
      target: i.sStable,
      params: config.pool.address,
    };
  });
  const balanceOutput = await sdk.api.abi.multiCall({
    chain: 'boba_bnb',
    abi: erc20ABI.balanceOf,
    calls: balanceCalls,
  });

  const decimalsCalls = config.chains.map((i) => {
    return {
      target: i.sStable,
      params: [],
    };
  });
  const decimalsOutput = await sdk.api.abi.multiCall({
    chain: 'boba_bnb',
    abi: erc20ABI.decimals,
    calls: decimalsCalls,
  });

  const tvl = {};
  config.chains.map((chainInfo, i) => {
    const decimals = parseInt(decimalsOutput.output[i].output);
    const balance = parseInt(balanceOutput.output[i].output);
    const delimiter = new BigNumber(10).pow(decimals);
    const usd = new BigNumber(balance).div(delimiter);
    tvl[chainInfo.stable] = usd.toNumber();
  });

  return tvl;
};

const main = async () => {
  const apyData = await loadApyData();
  const tvl = await loadTvlData();

  let data = [];
  config.chains.forEach((chainInfo) => {
    const { id, name: chain, stable, symbol } = chainInfo;

    data.push({
      pool: `symbiosis-finance-${stable}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'symbiosis',
      symbol,
      tvlUsd: tvl[stable],
      apyReward: apyData[id].apr,
      rewardTokens: ['0xd38bb40815d2b0c2d2c866e0c72c5728ffc76dd9'],
      underlyingTokens: [stable],
    });
  });

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app-v2.symbiosis.finance/liquidity-v2/pools',
};
