const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { default: BigNumber } = require('bignumber.js');
const { getPairs, getPrice } = require('./pearl');

const caviar = require('./abis/Caviar.json');
const caviarStakingChef = require('./abis/CaviarStakingChef.json');
const caviarRebaseChef = require('./abis/CaviarRebaseChef.json');
const pearl = require('./abis/Pearl.json');
const usdr = require('./abis/USDR.json');
const wusdr = require('./abis/WrappedUSDR.json');

const CHAIN_NAME = 'polygon';

exports.pool = async () => {
  const [pearlCaviarPair, pearlUsdrPair] = await getPairs([
    [pearl.address, caviar.address, false],
    [pearl.address, usdr.address, false],
  ]);

  return await Promise.all([
    sdk.api.abi
      .multiCall({
        calls: [
          {
            target: caviarRebaseChef.address,
          },
          {
            target: caviarStakingChef.address,
          },
        ],
        abi: caviarRebaseChef.abi.find((m) => m.name === 'rewardPerSecond'),
        chain: CHAIN_NAME,
      })
      .then((result) => result.output),
    sdk.api.abi.call({
      target: usdr.address,
      abi: usdr.abi.find((m) => m.name === 'liquidityIndex'),
      chain: CHAIN_NAME,
    }),
    sdk.api.abi.call({
      target: caviar.address,
      params: caviarStakingChef.address,
      abi: 'erc20:balanceOf',
      chain: CHAIN_NAME,
    }),
  ]).then(async (result) => {
    [
      caviarRewardPerSecond,
      wusdrRewardPerSecond,
      liquidityIndex,
      caviarBalance,
    ] = result.flat().map((res) => res.output);
    const [caviarPrice, pearlPrice] = await Promise.all([
      getPrice(pearlCaviarPair, pearl.address),
      getPrice(pearlUsdrPair, usdr.address),
    ]);
    const usdrPrice = await utils
      .getPrices([usdr.address], 'polygon')
      .then((result) => result.pricesByAddress[usdr.address.toLowerCase()]);
    const caviarBalanceInUSDR = new BigNumber(caviarBalance)
      .multipliedBy(caviarPrice)
      .multipliedBy(pearlPrice);
    const tvl = new BigNumber(caviarBalanceInUSDR)
      .div(1e18)
      .multipliedBy(usdrPrice);
    const aprBase = new BigNumber(caviarRewardPerSecond)
      .multipliedBy(60 * 60 * 24 * 365)
      .multipliedBy(caviarPrice)
      .multipliedBy(pearlPrice)
      .multipliedBy(usdrPrice)
      .dividedBy(tvl)
      .dividedBy(1e16);
    const aprReward = new BigNumber(wusdrRewardPerSecond)
      .multipliedBy(60 * 60 * 24 * 365)
      .multipliedBy(liquidityIndex)
      .multipliedBy(usdrPrice)
      .dividedBy(tvl)
      .dividedBy(1e34);
    return [tvl, aprBase, aprReward];
  });
};
