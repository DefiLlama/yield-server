const sdk = require('@defillama/sdk');
const axios = require('axios');
const { getPriceApiData } = require('../utils');

const token = '0x3802c218221390025bceabbad5d8c59f40eb74b8';
const steth = '0xae7ab96520de3a18e5e111b5eaab095312d7fe84';

const getPooledEthBySharesAbi = {
  inputs: [{ internalType: 'uint256', name: '_sharesAmount', type: 'uint256' }],
  name: 'getPooledEthByShares',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  stateMutability: 'view',
  type: 'function',
};

const oneShare = 1000000000000000000n;

const getEthStakingApy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dAgo = now - 86400;
  const timestamp7dAgo = now - 86400 * 7;

  const [block1d, block7d] = await Promise.all([
    sdk.blocks.getBlocks(timestamp1dAgo, ['ethereum']),
    sdk.blocks.getBlocks(timestamp7dAgo, ['ethereum']),
  ]);

  const rates = await Promise.all([
    sdk.api.abi.call({
      target: steth,
      abi: getPooledEthBySharesAbi,
      params: [oneShare],
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: steth,
      abi: getPooledEthBySharesAbi,
      params: [oneShare],
      chain: 'ethereum',
      block: block1d.ethereumBlock,
    }),
    sdk.api.abi.call({
      target: steth,
      abi: getPooledEthBySharesAbi,
      params: [oneShare],
      chain: 'ethereum',
      block: block7d.ethereumBlock,
    }),
  ]);

  const rateNow = rates[0].output / 1e18;
  const rate1dAgo = rates[1].output / 1e18;
  const rate7dAgo = rates[2].output / 1e18;
  const apyBase = ((rateNow / rate7dAgo) ** (365 / 7) - 1) * 100;
  const apyBase7d = apyBase;
  const apyBase1d = ((rateNow / rate1dAgo) ** 365 - 1) * 100;

  return { apyBase: Number.isFinite(apyBase) ? apyBase : apyBase1d, apyBase7d };
};

const getApy = async () => {
  const [tvl, { apyBase, apyBase7d }] = await Promise.all([
    sdk.api.erc20.totalSupply({ target: token }).then((r) => r.output / 1e18),
    getEthStakingApy(),
  ]);

  const priceKey = 'ethereum:0x0000000000000000000000000000000000000000';
  const ethPrice = (await getPriceApiData(`/prices/current/${priceKey}`)).coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'geth',
      symbol: 'geth',
      tvlUsd: tvl * ethPrice,
      apyBase,
      apyBase7d,
      underlyingTokens: ['0x0000000000000000000000000000000000000000'],
      searchTokenOverride: token,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '2454',
  timetravel: false,
  apy: getApy,
  url: 'https://guarda.com/staking/ethereum-staking/',
};
