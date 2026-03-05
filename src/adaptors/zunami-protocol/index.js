const utils = require('../utils');

const zunETHAddr = "0xc2e660C62F72c2ad35AcE6DB78a616215E2F2222";
const zunETHApsAddr = "0x5Ab3aa11a40eB34f1d2733f08596532871bd28e2";
const zunETHApsStakingAddr = "0x61b31cF4039D39F2F2909B8cb82cdb8eB5927Cd8";

const zunUSDAddr = "0x8C0D76C9B18779665475F3E212D9Ca1Ed6A1A0e6";
const zunUSDApsAddr = "0x28e487bbF6b64867C29e61DccbCD17aB64082889";
const zunUSDApsStakingAddr = "0x280d48e85f712e067a16d6b25e7ffe261c0810bd";

const zunStakingAddr = "0x45af4F12B46682B3958B297bAcebde2cE2E795c3";

// Underlying token addresses (Ethereum mainnet)
const tokens = {
  DAI: '0x6B175474E89094C44Da98b954EeadC7c9CaA3c2c',
  USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
  crvUSD: '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E',
  WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
  sfrxETH: '0xac3E018457B222d93114458476f3E3416Abbe38F',
  stETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
  ZUN: '0x6b5204B0Be36771253Cc38e88012E02B752f0f36',
};

const collectPools = async () => {
  const data = await utils.getData('https://api.zunami.io/api/pool/aggregated-info');
  const info = data['info'];

  const zunUSD = info['zunUSD'];
  const zunUSDAps = info['zunUSDAps'];
  const zunUSDApsStaking = info['zunUSDApsStaking'];

  const zunETH = info['zunETH'];
  const zunETHAps = info['zunETHAps'];
  const zunETHApsStaking = info['zunETHApsStaking'];

  const zunStaking = info['staking'];

  return [
    {
      pool: zunUSDAddr,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'DAI-USDC-USDT-crvUSD',
      tvlUsd: zunUSD['tvlUsd'],
      apy: zunUSD['apr'],
      underlyingTokens: [tokens.DAI, tokens.USDC, tokens.USDT, tokens.crvUSD],
    },
    {
      pool: zunUSDApsAddr,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'zunUSD',
      tvlUsd: zunUSDAps['tvlUsd'],
      apy: zunUSDAps['apy'],
      underlyingTokens: [zunUSDAddr],
    },
    {
      pool: zunUSDApsStakingAddr,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'apsZunUSD',
      tvlUsd: zunUSDApsStaking['tvlUsd'],
      apy: zunUSDApsStaking['apr'],
      underlyingTokens: [zunUSDApsAddr],
    },
    {
      pool: zunETHAddr,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'ETH-wETH-sfrxETH-stETH',
      tvlUsd: zunETH['tvlUsd'],
      apy: zunETH['apr'],
      underlyingTokens: [tokens.WETH, tokens.sfrxETH, tokens.stETH],
    },
    {
      pool: zunETHApsAddr,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'zunETH',
      tvlUsd: zunETHAps['tvlUsd'],
      apy: zunETHAps['apy'],
      underlyingTokens: [zunETHAddr],
    },
    {
      pool: zunETHApsStakingAddr,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'apsZunETH',
      tvlUsd: zunETHApsStaking['tvlUsd'],
      apy: zunETHApsStaking['apr'],
      underlyingTokens: [zunETHApsAddr],
    },
    {
      pool: zunStakingAddr,
      chain: utils.formatChain('ethereum'),
      project: 'zunami-protocol',
      symbol: 'ZUN',
      tvlUsd: zunStaking['tvlUsd'],
      apy: zunStaking['apr'],
      underlyingTokens: [tokens.ZUN],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://app.zunami.io/',
};
