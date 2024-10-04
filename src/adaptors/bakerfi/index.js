const sdk = require('@defillama/sdk');
const utils = require('../utils');
const axios = require('axios');

const API_URL = 'https://api-v1.bakerfi.xyz/api';

const oracles = {
  base: {
    ethToUSD: '0xddC3b00b6185484B54c00C154E6bB70c4942E910',
  },
  arbitrum: {
    ethToUSD: '0xE5873ea8B9BBcd7ed61A0feAC3f5e2c94b0086a4',
  },
};
const vaults = [
  {
    id: 'cly4i95530008kl5eesquxqyc',
    pool: `0x37327c99bBc522e677a97d01021dB20227faF60A-base`.toLowerCase(),
    chain: 'base',
    contract: '0x37327c99bBc522e677a97d01021dB20227faF60A',
    project: 'bakerfi',
    symbol: utils.formatSymbol('ETH'),
    apyReward: 0, // APY from pool LM rewards in %,
    rewardTokens: ['0x4200000000000000000000000000000000000006'], // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
    underlyingTokens: ['0x4200000000000000000000000000000000000006'], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
    poolMeta: 'wstETH/ETH Recursive Staking', // A string value which can stand for any specif
  },
  {
    id: 'cm1p7hcba0000125ua7hxn8m3',
    pool: `0x4c6d58749126FEBb1D28E8B8FdE97DC3107996d3-arbitrum`.toLowerCase(),
    chain: 'arbitrum',
    contract: '0x4c6d58749126FEBb1D28E8B8FdE97DC3107996d3',
    project: 'bakerfi',
    symbol: utils.formatSymbol('ETH'),
    apyReward: 0, // APY from pool LM rewards in %,
    rewardTokens: ['0x82af49447d8a07e3bd95bd0d56f35241523fbab1'], // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
    underlyingTokens: ['0x82af49447d8a07e3bd95bd0d56f35241523fbab1'], // Array of underlying token addresses from a pool, eg here USDT address on ethereum
    poolMeta: 'wstETH/ETH Recursive Staking', // A string value which can stand for any specif
  },
];

async function readVaultsInfo(args) {
  const res = [];

  for (const vault of vaults) {
    const { id, contract, ...rest } = vault;
    const ethUSDOracle = oracles[vault.chain].ethToUSD;

    const tvlInEth = await sdk.api.abi.call({
      target: contract,
      chain: vault.chain,
      abi: 'uint256:totalAssets',
    });

    const ethToUSD = await sdk.api.abi.call({
      target: ethUSDOracle,
      chain: vault.chain,
      abi: 'uint256:getLatestPrice',
    });

    const tvlUsd =
      (BigInt(tvlInEth.output) * BigInt(ethToUSD.output)) / BigInt(1e36);

    const { data } = await axios.get(`${API_URL}/vaults/${id}/yield`);

    res.push({
      ...rest,
      tvlUsd: Number(tvlUsd),
      apyBase: data.yield,
    });
  }

  return res;
}

module.exports = {
  timetravel: false,
  apy: readVaultsInfo,
  url: 'https://bakerfi.xyz/app',
};
