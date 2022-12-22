const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const axios = require('axios');

const getTokenPrice = async (token, exchangeTo, amount) => {
 const { data } = await axios.get(`https://min-api.cryptocompare.com/data/price?fsym=${token}&tsyms=${exchangeTo}`);
 const unitPrice = Object.values(data)[0];
 return amount * Number(unitPrice);
}

const formatUnits = (amount, decimals) => Number(ethers.utils.formatUnits(amount, decimals));

const poolsFunction = async () => {

  const LENDER_POOL_CONTRACT = '0xE544a0Ca5F4a01f137AE5448027471D6a9eC9661';
  const TRADE_REWARD = '0x64f33da516bf8289cf2f607aa357285753d6f039';
  const STABLE_REWARD = '0x352A424Caf2aB698570b1E9a273209b5A0fF52BD';
  const chain = 'polygon';
  const abis = {
    strategy: {"inputs":[],"name":"strategy","outputs":[{"internalType":"contract IStrategy","name":"","type":"address"}],"stateMutability":"view","type":"function"},
    getReward: {"inputs":[],"name":"getReward","outputs":[{"internalType":"uint16","name":"","type":"uint16"}],"stateMutability":"view","type":"function"},
    getBalance: {"inputs":[],"name":"getBalance","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  };

  const strategy = await sdk.api2.abi.call({
    target: LENDER_POOL_CONTRACT,
    abi: abis.strategy,
    chain,
  });

  const tvl = await sdk.api2.abi.call({
    target: strategy,
    abi: abis.getBalance,
    chain
  })

  const totalTVL = formatUnits(tvl, '6');

  const tradeReward = await sdk.api2.abi.call({
    target: TRADE_REWARD,
    abi: abis.getReward,
    chain,
  });

  const stableReward = await sdk.api2.abi.call({
    target: STABLE_REWARD,
    abi: abis.getReward,
    chain,
  });

  const tokenPrice = await getTokenPrice(
    "TRADE",
    "USD",
    formatUnits(tradeReward, '3'),
  );

const totalAPY = formatUnits(stableReward, '2') + tokenPrice;

  // const data = await utils.getData(
  //   'https://api.polytrade.app/defi-llama/get/tvl/apy'
  // );

  //const { totalTVL, totalAPY } = data.data;

  const lenderPool = {
    pool: `${LENDER_POOL_CONTRACT}-${chain}`,
    chain: 'Polygon',
    project: 'polytrade',
    symbol: 'USDC',
    tvlUsd: Number(totalTVL) / 1e6,
    apy: Number(totalAPY) * 100,
  };

  return [lenderPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://lender.polytrade.app',
};