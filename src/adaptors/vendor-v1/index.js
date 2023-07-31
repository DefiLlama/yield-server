const sdk = require('@defillama/sdk');
const { symbol } = require('@defillama/sdk/build/erc20');
const { request, gql } = require('graphql-request');
const axios = require('axios');
const { ethers } = require('ethers');
const networkData = require('./network-data');
const utils = require('../utils');

const ENTITY_URL = process.env.VENDOR_FINANCE;

const getPoolTokenInfo = async (tokens, network) => {
  const tokenSymbols = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: tokens.map((tokenAddr) => ({
        target: tokenAddr,
      })),
      chain: network,
    })
  ).output;

  const tokenDecimals = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: tokens.map((tokenAddr) => ({
        target: tokenAddr,
      })),
      chain: network,
    })
  ).output;
  return { tokenSymbols, tokenDecimals };
};

const getPoolTvl = async (
  poolAddr,
  tokens,
  [lendDecimals, colDecimals],
  network
) => {
  const lendBalance = await sdk.api.abi.call({
    target: tokens.lendToken,
    abi: 'erc20:balanceOf',
    params: poolAddr,
    chain: network,
  });
  const colBalance = await sdk.api.abi.call({
    target: tokens.colToken,
    abi: 'erc20:balanceOf',
    params: poolAddr,
    chain: network,
  });
  const formattedLendBal = ethers.utils.formatUnits(
    lendBalance.output.toString(),
    lendDecimals.output
  );
  const token = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${network.toLowerCase()}:${tokens.lendToken.toLowerCase()}`
    )
  ).coins;
  return Object.entries(token)[0][1].price * formattedLendBal;
};

const getPools = async () => {
  const pools = [];
  for (const networkConfig of networkData.networkData) {
    const response = await axios.post(ENTITY_URL, {
      query: networkConfig.query,
      type: networkConfig.type,
    });
    const network = networkConfig.network.toLowerCase();
    for (const pool of Object.entries(response.data)[0][1]) {
      const { tokenSymbols, tokenDecimals } = await getPoolTokenInfo(
        [pool._lendToken, pool._colToken],
        network
      );
      const tvl = await getPoolTvl(
        pool.id,
        { lendToken: pool._lendToken, colToken: pool._colToken },
        [tokenDecimals[0], tokenDecimals[1]],
        network
      );
      const poolObj = {
        pool: pool.id,
        chain: networkConfig.network,
        project: 'vendor-v1',
        symbol: `${tokenSymbols[1].output}-${tokenSymbols[0].output}`,
        tvlUsd: tvl,
        apyBaseBorrow:
          pool._type == 1
            ? ((31536000 /
                (Number(pool._expiry) - new Date().getTime() / 1000)) *
                pool._feeRate) /
              10000
            : pool._feeRate / 10000,
        underlyingTokens: [pool._lendToken, pool._colToken],
        poolMeta: 'V1 Pool',
      };
      pools.push(poolObj);
    }
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://v1.vendor.finance',
};
