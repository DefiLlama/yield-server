const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abi.json');
const BN = require('bignumber.js');

const apyhelper = '0xCf059594aE3FF11Bee9d3F3b3506d7Db73da48ff';

const poolInfo = async (chain) => {
  const getAPR = await sdk.api.abi.multiCall({
    calls: [
      {
        target: apyhelper,
      },
    ],
    abi: abi.find(({ name }) => name === 'getAPR'),
    chain: chain,
  });
  return getAPR.output;
};

const usdctvlInfo = async (chain) => {
  const getAPR = await sdk.api.abi.multiCall({
    calls: [
      {
        target: apyhelper,
      },
    ],
    abi: abi.find(({ name }) => name === 'getPinaUSDCTVL'),
    chain: chain,
  });
  return getAPR.output;
};

const usdcAPRInfo = async (chain) => {
  const getAPR = await sdk.api.abi.multiCall({
    calls: [
      {
        target: apyhelper,
      },
    ],
    abi: abi.find(({ name }) => name === 'getPinaUSDCAPR'),
    chain: chain,
  });
  return getAPR.output;
};

const poolsFunction = async () => {
  const chain = 'Ethereum';
  const pool = await poolInfo(chain.toLowerCase());
  const usdctvl = await usdctvlInfo(chain.toLowerCase());
  const usdcapr = await usdcAPRInfo(chain.toLowerCase());

  const forge = {
    pool: '0x02814F435dD04e254Be7ae69F61FCa19881a780D-ethereum',
    chain: chain,
    project: 'meme-dollar',
    symbol: utils.formatSymbol('PINA'),
    tvlUsd: Number(BN(pool[0].output[2]).div(1e18).toString()),
    apy: Number(BN(pool[0].output[1]).div(1e6).toString()),
    rewardTokens: ['0x02814F435dD04e254Be7ae69F61FCa19881a780D'],
    poolMeta: '5day lockup',
  };

  const pina_usdc = {
    pool: '0x58624E7a53700cb39772E0267ca0AC70f064078B-ethereum',
    chain: chain,
    project: 'meme-dollar',
    symbol: utils.formatSymbol('PINA-USDC'),
    tvlUsd: Number(BN(usdctvl[0].output).div(1e18).toString()),
    apy: Number(BN(usdcapr[0].output).div(1e6).toString()),
    rewardTokens: ['0x02814F435dD04e254Be7ae69F61FCa19881a780D'],
    poolMeta: '3day lockup',
  };

  const pina_meme = {
    pool: '0x713afA49478f1A33c3194Ff65dbf3c8058406670-ethereum',
    chain: chain,
    project: 'meme-dollar',
    symbol: utils.formatSymbol('PINA-MEME'),
    tvlUsd: Number(BN(pool[0].output[5]).div(1e18).toString()),
    apy: Number(BN(pool[0].output[4]).div(1e6).toString()),
    rewardTokens: ['0x02814F435dD04e254Be7ae69F61FCa19881a780D'],
    poolMeta: '3day lockup',
  };

  const meme_eth = {
    pool: '0xb892A4b35F227F27e4B58cc20691B3C671D0beC8-ethereum',
    chain: chain,
    project: 'meme-dollar',
    symbol: utils.formatSymbol('MEME-ETH'),
    tvlUsd: Number(BN(pool[0].output[8]).div(1e18).toString()),
    apy: Number(BN(pool[0].output[7]).div(1e6).toString()),
    rewardTokens: ['0x02814F435dD04e254Be7ae69F61FCa19881a780D'],
    poolMeta: '3day lockup',
  };
  return [forge, pina_usdc, pina_meme, meme_eth];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.dontdiememe.com/pina',
};
