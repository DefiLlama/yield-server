const sdk = require('@defillama/sdk');
const { symbol } = require('@defillama/sdk/build/erc20');
const { request, gql } = require('graphql-request');
const { ethers } = require('ethers');
const networkData = require('./network-data');
const utils = require('../utils');
const LendingPoolV2ABI = require('./LendingPoolV2ABI');

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
  lendTokenAddr,
  colTokenAddr,
  [lendDecimals, colDecimals],
  network
) => {
  // There are some cases where the lend balance of a pool is not stored in the pool itself,
  // but rather an external lending pool (like AAVE). The reason for this is to utilize idle
  // capital while the Vendor pool has yet to find a borrower. Due to this, a specific fc on
  // lending pool must be called to obtain the lend balance.
  const lendBalance = await sdk.api.abi.call({
    target: poolAddr,
    abi: LendingPoolV2ABI.find((fragment) => fragment.name === 'lendBalance'),
    chain: network,
  });
  const formattedLendBal = ethers.utils.formatUnits(
    lendBalance.output.toString(),
    lendDecimals.output
  );
  const token = (
    await utils.getData(
      `https://coins.llama.fi/prices/current/${network.toLowerCase()}:${lendTokenAddr.toLowerCase()}`
    )
  ).coins;
  return Object.entries(token)[0][1].price * formattedLendBal;
};

const getPools = async () => {
  const pools = [];
  for (const networkConfig of networkData.networkData) {
    const response = await request(ENTITY_URL, networkConfig.query);
    const network = networkConfig.network.toLowerCase();
    for (const pool of Object.entries(response)[0][1]) {
      const { tokenSymbols, tokenDecimals } = await getPoolTokenInfo(
        [pool.lendToken, pool.colToken],
        network
      );
      const tvl = await getPoolTvl(
        pool.id,
        pool.lendToken,
        pool.colToken,
        [tokenDecimals[0], tokenDecimals[1]],
        network
      );
      const poolObj = {
        pool: pool.id,
        chain: networkConfig.network,
        project: 'vendor-v2',
        symbol: `${tokenSymbols[1].output}-${tokenSymbols[0].output}`,
        tvlUsd: tvl,
        apyBase: parseInt(pool.startRate) / 10000,
        underlyingTokens: [pool.lendToken, pool.colToken],
        poolMeta: 'V2 Pool',
      };
      pools.push(poolObj);
    }
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://vendor.finance/borrow',
};
