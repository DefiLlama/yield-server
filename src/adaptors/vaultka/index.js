const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');

const chainlinkEthUsd = '0x639Fe6ab55C921f74e7fac1ee960C0B6293ba612';
const rewardTracker = '0x4e971a87900b931fF39d1Aad67697F49835400b6';

const getVaultMarketValue = {
  inputs: [],
  name: 'getVaultMarketValue',
  outputs: [
    {
      internalType: 'int256',
      name: 'vaultMarketValue',
      type: 'int256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

//for chainlink
const latestAnswer = {
  inputs: [],
  name: 'latestAnswer',
  outputs: [{ internalType: 'int256', name: '', type: 'int256' }],
  stateMutability: 'view',
  type: 'function',
};

//reward tracker

const totalSupply = {
  inputs: [],
  name: 'totalSupply',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

const tokensPerInterval = {
  inputs: [],
  name: 'tokensPerInterval',
  outputs: [
    {
      internalType: 'uint256',
      name: '',
      type: 'uint256',
    },
  ],
  stateMutability: 'view',
  type: 'function',
};

//glp price
const getPrice = {
  inputs: [{ internalType: 'bool', name: 'maximize', type: 'bool' }],
  name: 'getPrice',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

// waterEthRewardsSplitRate
const getEthRewardsSplitRate = {
  inputs: [],
  name: 'getEthRewardsSplitRate',
  outputs: [{ internalType: 'uint256', name: 'feeSplitRate', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};
//

const addresses = {
  vodkaVault: '0x0081772FD29E4838372CbcCdD020f53954f5ECDE',
  waterVault: '0x6df0018b0449bB4468BfAE8507E13021a7aa0583',
};

const poolsFunction = async () => {
  const tvls = Object.fromEntries(
    await Promise.all(
      Object.entries(addresses).map(async ([name, address]) => {
        let res = (
          await sdk.api.abi.call({
            abi: getVaultMarketValue,
            target: address,
            chain: 'arbitrum',
          })
        ).output;
        return [name, Number(ethers.utils.formatUnits(res, 6))];
      })
    )
  );

  const ethPrice = (
    await sdk.api.abi.call({
      abi: latestAnswer,
      target: chainlinkEthUsd,
      chain: 'arbitrum',
    })
  ).output;

  const glpTokensPerInterval = (
    await sdk.api.abi.call({
      abi: tokensPerInterval,
      target: rewardTracker,
      chain: 'arbitrum',
    })
  ).output;

  const glpTotalSupply = (
    await sdk.api.abi.call({
      abi: totalSupply,
      target: rewardTracker,
      chain: 'arbitrum',
    })
  ).output;

  const VodkaGlpPrice = (
    await sdk.api.abi.call({
      abi: getPrice,
      target: addresses.vodkaVault,
      chain: 'arbitrum',
      params: [true],
    })
  ).output;

  const EthRewardsSplitRate = (
    await sdk.api.abi.call({
      abi: getEthRewardsSplitRate,
      target: addresses.waterVault,
      chain: 'arbitrum',
    })
  ).output;

  // calculate the annulized reward of glp's interval reward
  // = reward per interval * total interval * eth price
  const secondsPerYear = 31536000;
  const annualizedReward =
    Number(ethers.utils.formatUnits(ethPrice, 8)) *
    Number(ethers.utils.formatEther(glpTokensPerInterval)) *
    secondsPerYear;

  // calculate glp's apr
  // = annualized reward / (glp total supply * glp price)
  const glpApr =
    annualizedReward /
    (Number(ethers.utils.formatEther(glpTotalSupply)) *
      Number(ethers.utils.formatEther(VodkaGlpPrice)));

  const protocolFee = 0.18;

  const rewardToUser = glpApr * tvls.vodkaVault * (1 - protocolFee);

  const waterFeeShare = Number(
    ethers.utils.formatUnits(EthRewardsSplitRate, 30)
  );

  const waterRewards = rewardToUser * waterFeeShare;
  const vodkaRewards = rewardToUser * (1 - waterFeeShare);

  const vodkaApy = (vodkaRewards / tvls.vodkaVault) * 100;
  const waterApy = (waterRewards / tvls.waterVault) * 100;

  const vodkaVault = {
    pool: '0x0081772FD29E4838372CbcCdD020f53954f5ECDE',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: 'GLP',
    tvlUsd: tvls.vodkaVault,
    poolMeta: 'VAULTKA_VODKA',
    underlyingTokens: ['0x2F546AD4eDD93B956C8999Be404cdCAFde3E89AE'],
    apy: vodkaApy,
  };

  const waterVault = {
    pool: '0x6df0018b0449bB4468BfAE8507E13021a7aa0583',
    chain: utils.formatChain('arbitrum'),
    project: 'vaultka',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: tvls.waterVault,
    poolMeta: 'VAULTKA_WATER',
    underlyingTokens: ['0xff970a61a04b1ca14834a43f5de4533ebddb5cc8'],
    apy: waterApy,
  };

  return [vodkaVault, waterVault];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.vaultka.com/app/vaults',
};
