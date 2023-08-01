const sdk = require('@defillama/sdk');
const { symbol } = require('@defillama/sdk/build/erc20');
const { gql } = require('graphql-request');
const { ethers } = require('ethers');
const networkData = require('./network-data');
const axios = require('axios');
const utils = require('../utils');
const { LendingPoolV2ABI, FeesManagerABI } = require('./ContractABIs');

const ENTITY_URL = process.env.VENDOR_FINANCE;

const ARBITRUM_FEES_MANAGER = '0x6c58D106C613627Bd11A885fC15A1572a358AA27';
const ETHEREUM_FEES_MANAGER = '0x0Cc43a4C570e7EED16c34Ce8540ae5dA037fDf0A';

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
  const tokensData = {
    lendTokenSymbol: tokenSymbols[0].output,
    colTokenSymbol: tokenSymbols[1].output,
    lendTokenDecimals: tokenDecimals[0].output,
    colTokenDecimals: tokenDecimals[1].output,
  };
  return tokensData;
};

const getAvailableLiquidity = async (
  poolAddr,
  lendTokenInfo,
  lendDecimals,
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
    lendBalance.output,
    lendDecimals
  );
  return Object.entries(lendTokenInfo)[0][1].price * formattedLendBal;
};

const getTokenPriceInfo = async (tokens, network) => {
  const tokenDataPromises = tokens.map((token) =>
    utils.getData(
      `https://coins.llama.fi/prices/current/${network.toLowerCase()}:${token.toLowerCase()}`
    )
  );
  const tokenDataArray = await Promise.all(tokenDataPromises);
  const tokenData = tokenDataArray.map((tokenInfo) => tokenInfo.coins);
  return tokenData;
};

const getLoanToValue = (lendTokenPriceObj, colTokenPriceObj, pool, poolFee) => {
  // get token prices from tokenPrice context object
  let lendPrice = Object.entries(lendTokenPriceObj)[0][1].price;
  const colPrice = Object.entries(colTokenPriceObj)[0][1].price;
  const protocolFee = pool.protocolFee / 1000000;
  // calculate LTV from lend and collateral prices
  const mintRatio = ethers.utils.formatUnits(pool.mintRatio, 18);
  const ltvLendValue = parseFloat(mintRatio) * lendPrice;
  const ltvColValue = colPrice;
  const totalFees =
    ltvLendValue / (1 - protocolFee - Number(poolFee) / 10000 / 100) -
    ltvLendValue;
  return (ltvLendValue - totalFees) / ltvColValue;
};

const getSuppliedAndBorrowedUsd = async (
  pool,
  lendDecimals,
  colDecimals,
  lendTokenPriceObj,
  network
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
      target: pool.id,
      abi: LendingPoolV2ABI.find((fragment) => fragment.name === 'colBalance'),
      chain: network,
    })
  ).output;
  const lendBalance = (
    await sdk.api.abi.call({
      target: pool.id,
      abi: LendingPoolV2ABI.find((fragment) => fragment.name === 'lendBalance'),
      chain: network,
    })
  ).output;
  // Calculated the total borrowed amount in $USD
  let totalBorrowed =
    parseFloat(pool.mintRatio / 10 ** 18) *
    parseFloat(ethers.utils.formatUnits(colBalance, colDecimals.output));
  const poolFee = Number(lendFee) / 10000 / 100;
  const protocolFee = pool.protocolFee / 1000000;
  const totalBorrowedAdjusted = (totalBorrowed *= 1 - protocolFee - poolFee);
  const lendTokenPrice = Object.entries(lendTokenPriceObj)[0][1].price;
  const totalBorrowedUsd = totalBorrowedAdjusted * lendTokenPrice;
  // Calculates the total supplied amount (available lend balance + total borrowed) in $USD
  const lendBalanceUsd =
    lendTokenPrice *
    parseFloat(ethers.utils.formatUnits(lendBalance, lendDecimals));
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
      const {
        lendTokenSymbol,
        colTokenSymbol,
        lendTokenDecimals,
        colTokenDecimals,
      } = await getGenericTokenInfo([pool.lendToken, pool.colToken], network);
      const [lendTokenPriceInfo, colTokenPriceInfo] = await getTokenPriceInfo(
        [pool.lendToken, pool.colToken],
        network
      );
      const availableLiquidity = await getAvailableLiquidity(
        pool.id,
        lendTokenPriceInfo,
        lendTokenDecimals,
        network
      );
      if (availableLiquidity < 10000) continue;
      const { totalBorrowedUsd, totalSuppliedUsd, lendFee } =
        await getSuppliedAndBorrowedUsd(
          pool,
          lendTokenDecimals,
          colTokenDecimals,
          lendTokenPriceInfo,
          network
        );
      const loanToValue = getLoanToValue(
        lendTokenPriceInfo,
        colTokenPriceInfo,
        pool,
        lendFee
      );
      const poolObj = {
        pool: pool.id,
        chain: networkConfig.network,
        project: 'vendor-v2',
        ltv: loanToValue,
        underlyingTokens: [pool.lendToken, pool.colToken],
        symbol: lendTokenSymbol,
        tvlUsd: availableLiquidity,
        totalBorrowUsd: totalBorrowedUsd,
        totalSupplyUsd: totalSuppliedUsd,
        apyBase: 0,
        apyBaseBorrow:
          pool.feeType == 1
            ? ((31536000 /
                (Number(pool.expiry) - new Date().getTime() / 1000)) *
                pool.startRate) /
              10000
            : pool.startRate / 10000,
        poolMeta: `Due ${new Date(pool.expiry * 1000)
          .toUTCString()
          .slice(5, -13)}, ${colTokenSymbol} collateral`,
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
