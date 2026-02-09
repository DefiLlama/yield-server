const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');
const { getApy7d } = require('./apy');

const HYPEREVM_CHAIN = 'hyperliquid';

const USDC_HYPEREVM = '0xb88339CB7199b77E23DB6E890353E22632Ba630f';
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const XHYPE = {
  hyperevm: {
    address: '0xac962fa04bf91b7fd0dc0c5c32414e0ce3c51e03',
    navOracle: '0xbF97a22B1229B3FfbA65003C01df8bA9e7bfF042',
    chain: 'hyperliquid',
    chainDisplay: 'HyperEVM',
    underlyingTokens: [USDC_HYPEREVM],
  },
  hyperliquid: {
    address: '0xac962fa04bf91b7fd0dc0c5c32414e0ce3c51e03',
    chain: 'hyperliquid',
    chainDisplay: 'Hyperliquid',
    underlyingTokens: [USDC_HYPEREVM],
  },
  hyperliquidL1: {
    address: '0xac962fa04bf91b7fd0dc0c5c32414e0ce3c51e03',
    chain: 'hyperliquid',
    chainDisplay: 'Hyperliquid L1',
    underlyingTokens: [USDC_HYPEREVM],
  },
  arbitrum: {
    address: '0xcffE430E9492966727Ddc60eb183fe93E5a218E4',
    chain: 'arbitrum',
    chainDisplay: 'Arbitrum',
    underlyingTokens: [USDC_ARBITRUM],
  },
  ethereum: {
    address: '0xAc962FA04BF91B7fd0DC0c5C32414E0Ce3C51E03',
    chain: 'ethereum',
    chainDisplay: 'Ethereum',
    underlyingTokens: [USDC_ETHEREUM],
  },
};

async function getTvlUsd() {
  const navResult = await sdk.api.abi.call({
    target: XHYPE.hyperevm.navOracle,
    abi: abi.getNAV,
    chain: HYPEREVM_CHAIN,
  });

  const navIn18Decimals = new BigNumber(navResult.output);
  return navIn18Decimals.div(1e18).toNumber();
}

async function main() {
  const tvlUsd = await getTvlUsd();
  const apyBase7d = await getApy7d(XHYPE.hyperevm.navOracle, XHYPE.hyperevm.address, HYPEREVM_CHAIN);

  const pools = Object.entries(XHYPE).map(([key, config]) => ({
    pool: `${config.address}-${config.chain}-${key}`.toLowerCase(),
    chain: config.chainDisplay,
    project: 'liminal',
    symbol: 'xHYPE',
    tvlUsd,
    apyBase: apyBase7d,
    apyBase7d,
    underlyingTokens: config.underlyingTokens,
    poolMeta: 'Delta-neutral yield',
    url: 'https://liminal.money/app/tokenized',
  }));

  return pools.filter((p) => p.tvlUsd > 0);
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://liminal.money/',
};
