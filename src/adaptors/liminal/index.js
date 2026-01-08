const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');
const { getApy, getApy7d } = require('./apy');

const CHAIN = 'hyperliquid';
const CHAIN_DISPLAY = 'Hyperliquid L1';

const USDC = '0xb88339CB7199b77E23DB6E890353E22632Ba630f';

const XHYPE = {
  shareManager: '0xac962fa04bf91b7fd0dc0c5c32414e0ce3c51e03',
  navOracle: '0xbF97a22B1229B3FfbA65003C01df8bA9e7bfF042',
  symbol: 'xHYPE',
  underlyingTokens: [USDC],
};

async function getTvlUsd(shareManagerAddress, navOracleAddress) {
  const navResult = await sdk.api.abi.call({
    target: navOracleAddress,
    abi: abi.getNAV,
    chain: CHAIN,
  });

  const navIn18Decimals = new BigNumber(navResult.output);
  return navIn18Decimals.div(1e18).toNumber();
}

async function getXHypePool() {
  const tvlUsd = await getTvlUsd(XHYPE.shareManager, XHYPE.navOracle);

  const apyBase = await getApy(XHYPE.navOracle, XHYPE.shareManager, CHAIN);
  const apyBase7d = await getApy7d(XHYPE.navOracle, XHYPE.shareManager, CHAIN);

  return {
    pool: `${XHYPE.shareManager}-${CHAIN}`.toLowerCase(),
    chain: CHAIN_DISPLAY,
    project: 'liminal',
    symbol: XHYPE.symbol,
    tvlUsd,
    apyBase,
    apyBase7d,
    underlyingTokens: XHYPE.underlyingTokens,
    poolMeta: 'Delta-neutral yield',
    url: 'https://liminal.money/app/tokenized',
  };
}

async function main() {
  const pools = await Promise.all([getXHypePool()]);
  return pools.filter((p) => p.tvlUsd > 0);
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://liminal.money/',
};
