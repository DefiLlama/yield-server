const sdk = require('@defillama/sdk');
const { symbol } = require('@defillama/sdk/build/erc20');
const { request, gql } = require('graphql-request');
const { ethers } = require('ethers');
const utils = require('../utils');
const LendingPoolV2ABI = require('./LendingPoolV2ABI');

const graphUrl =
  'https://gateway-arbitrum.network.thegraph.com/api/be39f5ca1f98b2c1ab3533ab78a988a7/subgraphs/id/QMC5tfVVQKLUR7nnhfKLJhqLc61K7wa62gysKEG4UFR';

const query = `
  {
    pools(
      first: 1000
      lendBalance_gt: 0
      paused: false
      expiry_gt: ${new Date().getTime() / 1000}
    ) {
      id
      colToken
      lendToken
      feeType
      startRate
      poolType
      expiry
      mintRatio
      lendBalance
      borrowers
    }
  }
`;

const getPoolTokenInfo = async (tokens) => {
  const tokenSymbols = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: tokens.map((tokenAddr) => ({
        target: tokenAddr,
      })),
      chain: 'arbitrum',
    })
  ).output;

  const tokenDecimals = (
    await sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: tokens.map((tokenAddr) => ({
        target: tokenAddr,
      })),
      chain: 'arbitrum',
    })
  ).output;
  return { tokenSymbols, tokenDecimals };
};

const getPoolTvl = async (
  poolAddr,
  lendTokenAddr,
  colTokenAddr,
  [lendDecimals, colDecimals]
) => {
  // There are some cases where the lend balance of a pool is not stored in the pool itself,
  // but rather an external lending pool (like AAVE). The reason for this is to utilize idle
  // capital while the Vendor pool has yet to find a borrower. Due to this, a specific fc on
  // lending pool must be called to obtain the lend balance.
  const lendBalance = await sdk.api.abi.call({
    target: poolAddr,
    abi: LendingPoolV2ABI.find((fragment) => fragment.name === 'lendBalance'),
    chain: 'arbitrum',
  });
  const colBalance = await sdk.api.abi.call({
    target: poolAddr,
    abi: LendingPoolV2ABI.find((fragment) => fragment.name === 'colBalance'),
    chain: 'arbitrum',
  });
  const formattedLendBal = ethers.utils.formatUnits(
    lendBalance.output.toString(),
    lendDecimals.output
  );
  const formattedColBal = ethers.utils.formatUnits(
    colBalance.output.toString(),
    colDecimals.output
  );
  const tokenKeys = [lendTokenAddr, colTokenAddr]
    .map((i) => `arbitrum:${i}`)
    .join(',')
    .toLowerCase();
  const tokenPrices = (
    await utils.getData(`https://coins.llama.fi/prices/current/${tokenKeys}`)
  ).coins;
  let tvl = 0;
  for (const key in tokenPrices) {
    const tokenPrice = tokenPrices[key].price;
    const formattedBal =
      key === `arbitrum:${lendTokenAddr}` ? formattedLendBal : formattedColBal;
    const tokenValue = tokenPrice * formattedBal;
    tvl += tokenValue;
  }
  return tvl;
};

const getPools = async () => {
  const pools = [];
  const response = await request(graphUrl, query);
  for (const pool of response.pools) {
    const { tokenSymbols, tokenDecimals } = await getPoolTokenInfo([
      pool.lendToken,
      pool.colToken,
    ]);
    const tvl = await getPoolTvl(pool.id, pool.lendToken, pool.colToken, [
      tokenDecimals[0],
      tokenDecimals[1],
    ]);
    const poolObj = {
      pool: pool.id,
      chain: 'Arbitrum',
      project: 'vendor-v2',
      symbol: `${tokenSymbols[1].output}-${tokenSymbols[0].output}`,
      tvlUsd: tvl,
      apyBase: parseInt(pool.startRate) / 10000,
      apyReward: parseInt(pool.startRate) / 10000,
      rewardTokens: [],
      underlyingTokens: [pool.lendToken, pool.colToken],
      poolMeta: 'V2 Pool',
    };
    pools.push(poolObj);
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://vendor.finance/borrow',
};
