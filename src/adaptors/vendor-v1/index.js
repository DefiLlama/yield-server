const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');
const { ethers } = require('ethers');
const networkData = require('./network-data');
const utils = require('../utils');
const { FeesManagerABI } = require('./ContractABIs');

const ENTITY_URL = process.env.VENDOR_FINANCE;
const ARBITRUM_FEES_MANAGER = '0x34F429e82dA625aBa84e80B5c2a9fa471771B807';
const ETHEREUM_FEES_MANAGER = '0xeCBFd6cF5Eebe9313D386A19a42a474a2998e56b';

const getGenericTokenInfo = async (tokens, network) => {
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
  const lendBalance = (
    await sdk.api.abi.call({
      target: pool._lendToken,
      abi: 'erc20:balanceOf',
      params: pool.id,
      chain: network,
    })
  ).output;
  const formattedLendBal = ethers.utils.formatUnits(
    lendBalance,
    lendDecimals.output
  );
  return Object.entries(lendTokenInfo)[0][1].price * formattedLendBal;
};

const getTokenPriceInfo = async (network, tokenAddresses) => {
  const tokenDataPromises = tokenAddresses.map((address) =>
    utils.getData(
      `https://coins.llama.fi/prices/current/${network.toLowerCase()}:${address.toLowerCase()}`
    )
  );
  const tokenDataArray = await Promise.all(tokenDataPromises);
  const tokenData = tokenDataArray.map((tokenInfo) => tokenInfo.coins);
  return tokenData;
};

const getLoanToValue = (tokenInfo, pool) => {
  // get token prices from tokenPrice context object
  let lendPrice = Object.entries(tokenInfo[0])[0][1].price;
  const colPrice = Object.entries(tokenInfo[1])[0][1].price;
  // calculate LTV from lend and collateral prices
  const mintRatio = ethers.utils.formatUnits(pool._mintRatio, 18);
  const ltvLendValue = parseFloat(mintRatio) * lendPrice;
  const ltvColValue = colPrice;
  return ltvLendValue / ltvColValue;
};

const getSuppliedAndBorrowedUsd = async (
  pool,
  lendDecimals,
  colDecimals,
  network,
  tokenPriceInfo
) => {
  const lendFee = (
    await sdk.api.abi.call({
      target:
        network === 'arbitrum' ? ARBITRUM_FEES_MANAGER : ETHEREUM_FEES_MANAGER,
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
  const protocolFee = pool._protocolFee / 1000000;
  const totalBorrowedAdjusted = (totalBorrowed *= 1 - protocolFee - poolFee);
  const lendTokenPrice = Object.entries(tokenPriceInfo)[0][1].price;
  const totalBorrowedUsd = totalBorrowedAdjusted * lendTokenPrice;
  // Calculates the total supplied amount (available lend balance + total borrowed) in $USD
  const lendBalanceUsd =
    lendTokenPrice *
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
      const { tokenSymbols, tokenDecimals } = await getGenericTokenInfo(
        [pool._lendToken, pool._colToken],
        network
      );
      const tokenPriceInfo = await getTokenPriceInfo(network, [
        pool._lendToken,
        pool._colToken,
      ]);
      const availableLiquidity = await getAvailableLiquidity(
        pool,
        tokenPriceInfo[0],
        tokenDecimals[0],
        network
      );
      const { totalBorrowedUsd, totalSuppliedUsd, lendFee } =
        await getSuppliedAndBorrowedUsd(
          pool,
          tokenDecimals[0],
          tokenDecimals[1],
          network,
          tokenPriceInfo[0]
        );
      const loanToValue = getLoanToValue(tokenPriceInfo, pool);
      const poolObj = {
        pool: pool.id,
        chain: networkConfig.network,
        project: 'vendor-v1',
        ltv: loanToValue,
        underlyingTokens: [pool._lendToken, pool._colToken],
        symbol: tokenSymbols[0].output,
        tvlUsd: availableLiquidity,
        totalBorrowUsd: totalBorrowedUsd,
        totalSupplyUsd: totalSuppliedUsd,
        apyBase: 0,
        apyBaseBorrow:
          pool._type == 1
            ? ((31536000 /
                (Number(pool._expiry) - new Date().getTime() / 1000)) *
                pool._feeRate) /
              10000
            : pool._feeRate / 10000,
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
