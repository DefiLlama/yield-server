const sdk = require('@defillama/sdk');
const { symbol } = require('@defillama/sdk/build/erc20');
const { request, gql } = require('graphql-request');
const axios = require('axios');
const { ethers } = require('ethers');
const networkData = require('./network-data');
const utils = require('../utils');
const { FeesManagerABI } = require('./ContractABIs');

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

const getAvailableLiquidity = async (
  pool,
  lendTokenInfo,
  lendDecimals,
  network
) => {
  const lendBalance = await sdk.api.abi.call({
    target: pool._lendToken,
    abi: 'erc20:balanceOf',
    params: pool.id,
    chain: network,
  });
  const formattedLendBal = ethers.utils.formatUnits(
    lendBalance.output.toString(),
    lendDecimals.output
  );
  return Object.entries(lendTokenInfo)[0][1].price * formattedLendBal;
};

const getTokenPairInfo = async (network, tokenAddresses) => {
  const tokenDataPromises = tokenAddresses.map((address) =>
    utils.getData(
      `https://coins.llama.fi/prices/current/${network.toLowerCase()}:${address.toLowerCase()}`
    )
  );
  const tokenDataArray = await Promise.all(tokenDataPromises);
  const tokenData = tokenDataArray.map((tokenInfo) => tokenInfo.coins);
  return tokenData;
};

const getSuppliedAndBorrowedUsd = async (
  pool,
  lendDecimals,
  colDecimals,
  network,
  tokenPriceInfo
) => {
  console.log(tokenPriceInfo);
  const lendFee = (
    await sdk.api.abi.call({
      target:
        network === 'arbitrum'
          ? '0x34F429e82dA625aBa84e80B5c2a9fa471771B807' // Arbitrum Position Tracker
          : '0xeCBFd6cF5Eebe9313D386A19a42a474a2998e56b', // Ethereum Position Tracker
      abi: FeesManagerABI.find(
        (fragment) => fragment.name === 'getCurrentRate'
      ),
      chain: network,
      params: pool.id,
    })
  ).output;
  const colBalance = (
    await sdk.api.abi.call({
      target: pool._colToken,
      abi: 'erc20:balanceOf',
      params: pool.id,
      chain: network,
    })
  ).output;
  const lendBalance = (
    await sdk.api.abi.call({
      target: pool._lendToken,
      abi: 'erc20:balanceOf',
      params: pool.id,
      chain: network,
    })
  ).output;
  // Calculated the total borrowed amount in $USD
  let totalBorrowed =
    parseFloat(pool._mintRatio / 10 ** 18) *
    parseFloat(ethers.utils.formatUnits(colBalance, colDecimals.output));
  const poolFee = Number(lendFee) / 10000 / 100;
  let totalBorrowedAdjusted = (totalBorrowed *=
    1 - pool._protocolFee / 1000000 - poolFee);
  let totalBorrowedUsd =
    totalBorrowedAdjusted * Object.entries(tokenPriceInfo)[0][1].price;
  // Calculates the total supplied amount (available lend balance + total borrowed) in $USD
  const lendBalanceUsd =
    Object.entries(tokenPriceInfo)[0][1].price *
    parseFloat(ethers.utils.formatUnits(lendBalance, lendDecimals.output));
  const totalSuppliedUsd = lendBalanceUsd + totalBorrowed;

  return { totalBorrowedUsd, totalSuppliedUsd, lendFee };
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
      const tokenInfo = await getTokenPairInfo(network, [
        pool._lendToken,
        pool._colToken,
      ]);
      const availableLiquidity = await getAvailableLiquidity(
        pool,
        tokenInfo[0],
        tokenDecimals[0],
        network
      );
      const { totalBorrowedUsd, totalSuppliedUsd, lendFee } =
        await getSuppliedAndBorrowedUsd(
          pool,
          tokenDecimals[0],
          tokenDecimals[1],
          network,
          tokenInfo[0]
        );
      const poolObj = {
        pool: pool.id,
        chain: networkConfig.network,
        project: 'vendor-v1',
        symbol: tokenSymbols[0].output,
        tvlUsd: availableLiquidity,
        apyBaseBorrow:
          pool._type == 1
            ? ((31536000 /
                (Number(pool._expiry) - new Date().getTime() / 1000)) *
                pool._feeRate) /
              10000
            : pool._feeRate / 10000,
        underlyingTokens: [pool._lendToken, pool._colToken],
        poolMeta: `Due ${new Date(pool._expiry * 1000)
          .toUTCString()
          .slice(5, -13)}, ${tokenSymbols[1].output} collateral`,
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
