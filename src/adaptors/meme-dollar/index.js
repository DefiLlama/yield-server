const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abi.json');
const BN = require('bignumber.js');

const apyhelper = '0xCf059594aE3FF11Bee9d3F3b3506d7Db73da48ff';

// Token addresses
const PINA = '0x02814F435dD04e254Be7ae69F61FCa19881a780D';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const MEME = '0xb131f4A55907B10d1F0A50d8ab8FA09EC342cd74';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';

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
    underlyingTokens: [PINA],
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
    underlyingTokens: [PINA, USDC],
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
    underlyingTokens: [PINA, MEME],
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
    underlyingTokens: [MEME, WETH],
  };
  return [forge, pina_usdc, pina_meme, meme_eth];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://www.dontdiememe.com/pina',
};
