const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const axios = require('axios');

const oracleAbi = require('./abis/oracle.json');
const cdpAbi = require('./abis/cdp.json');

const oracleContract = '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419';
const cdpContract = '0x7f0A0C7149a46Bf943cCd412da687144b49C6014';

const getCats = async () => {
  const decimals = (
    await sdk.api.abi.call({
      target: oracleContract,
      abi: 'erc20:decimals',
    })
  ).output;

  const ethereumPriceInDollar =
    (
      await sdk.api.abi.call({
        target: oracleContract,
        abi: oracleAbi.find((m) => m.name === 'latestAnswer'),
      })
    ).output /
    10 ** decimals;

  let tvl = (
    await sdk.api.abi.call({
      target: cdpContract,
      abi: cdpAbi.find((m) => m.name === 'totaldeposits'),
    })
  ).output;

  let tdl = (
    await sdk.api.abi.call({
      target: cdpContract,
      abi: cdpAbi.find((m) => m.name === 'totalDebt'),
    })
  ).output;

  tvl = ethers.utils.formatEther(tvl);
  tdl = ethers.utils.formatEther(tdl);

  const lidoStethApr = (
    await axios.get('https://stake.lido.fi/api/sma-steth-apr')
  )['data'];
  const userPoints = 1 - 0;
  const totalPoints = tvl + 1 - tdl;
  let totalProtocolYieldCollateral = (tvl + 1) * (lidoStethApr / 100);
  const protocolFeesCollateral =
    totalProtocolYieldCollateral / 100 +
    (totalProtocolYieldCollateral * tdl) / ((tvl + 1) * 4);
  totalProtocolYieldCollateral -= protocolFeesCollateral;
  let depositAprCollateral =
    totalProtocolYieldCollateral / (totalPoints / userPoints);
  if (isNaN(depositAprCollateral)) {
    depositAprCollateral = 0;
  }
  let depositAprPercentage = 100 / (1 / depositAprCollateral);
  if (isNaN(depositAprPercentage)) {
    depositAprPercentage = 0;
  }

  return [
    {
      pool: '0xae7ab96520de3a18e5e111b5eaab095312d7fe84-ethereum-cat-in-a-box',
      chain: 'Ethereum',
      project: 'cat-in-a-box',
      symbol: 'stETH',
      tvlUsd: Math.round(tvl * ethereumPriceInDollar * 100) / 100,
      apyBase: Math.round(depositAprPercentage * 100) / 100,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getCats,
  url: 'https://catinabox.finance/app',
};
