const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abi');
const { getApy7d } = require('./apy');

const HYPERLIQUID_L1_CHAIN = 'hyperliquid';

const USDC_HYPEREVM = '0xb88339CB7199b77E23DB6E890353E22632Ba630f';
const USDC_ARBITRUM = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';
const USDC_ETHEREUM = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

const PRODUCTS = [
  {
    symbol: 'xHYPE',
    poolMeta: 'Delta-neutral yield',
    deployments: {
      hyperliquidL1: {
        address: '0xac962fa04bf91b7fd0dc0c5c32414e0ce3c51e03',
        navOracle: '0xbF97a22B1229B3FfbA65003C01df8bA9e7bfF042',
        chain: 'hyperliquid',
        underlyingTokens: [USDC_HYPEREVM],
      },
      arbitrum: {
        address: '0xcffE430E9492966727Ddc60eb183fe93E5a218E4',
        chain: 'arbitrum',
        underlyingTokens: [USDC_ARBITRUM],
      },
      ethereum: {
        address: '0xAc962FA04BF91B7fd0DC0c5C32414E0Ce3C51E03',
        chain: 'ethereum',
        underlyingTokens: [USDC_ETHEREUM],
      },
    },
  },
  {
    symbol: 'xBTC',
    poolMeta: 'Delta-neutral yield',
    deployments: {
      hyperliquidL1: {
        address: '0x97df58CE4489896F4eC7D16B59B64aD0a56243a8',
        navOracle: '0x2A6448fc3A0FAde5811bb0087836a090EaA34715',
        chain: 'hyperliquid',
        underlyingTokens: [USDC_HYPEREVM],
      },
      arbitrum: {
        address: '0xA06A65032b78106EA47d122387E40E1fbCBA942d',
        chain: 'arbitrum',
        underlyingTokens: [USDC_ARBITRUM],
      },
      ethereum: {
        address: '0x0c0104e35A101de9af2e0cb307A15e1175580Bd5',
        chain: 'ethereum',
        underlyingTokens: [USDC_ETHEREUM],
      },
    },
  },
  {
    symbol: 'xLEND',
    poolMeta: 'Money market yield',
    deployments: {
      hyperliquidL1: {
        address: '0x95f6d66c09A22e6F2bB693306b3ed69663066cbB',
        navOracle: '0xdbB4da0f1548F6237DF6960532563804A901C2AE',
        chain: 'hyperliquid',
        underlyingTokens: [USDC_HYPEREVM],
      },
      arbitrum: {
        address: '0xD68700e70F1bC9BFc589082b27083f27ac85936C',
        chain: 'arbitrum',
        underlyingTokens: [USDC_ARBITRUM],
      },
      ethereum: {
        address: '0xD68700e70F1bC9BFc589082b27083f27ac85936C',
        chain: 'ethereum',
        underlyingTokens: [USDC_ETHEREUM],
      },
    },
  },
  {
    symbol: 'limUSD',
    poolMeta: 'Diversified Hyperliquid yield',
    deployments: {
      hyperliquidL1: {
        address: '0x1822bd335489d84abdd0779a7dCAeDa0625e83c8',
        navOracle: '0x47f8d4847f528C18Ea5A6dcb9E0940F6b2977CA7',
        chain: 'hyperliquid',
        underlyingTokens: [USDC_HYPEREVM],
      },
      arbitrum: {
        address: '0x9B74D3BD96f54dE689CfFDeb27EE34f68dFf086d',
        chain: 'arbitrum',
        underlyingTokens: [USDC_ARBITRUM],
      },
      ethereum: {
        address: '0x9B74D3BD96f54dE689CfFDeb27EE34f68dFf086d',
        chain: 'ethereum',
        underlyingTokens: [USDC_ETHEREUM],
      },
    },
  },
];

async function getTvlUsd(navOracleAddress) {
  const navResult = await sdk.api.abi.call({
    target: navOracleAddress,
    abi: abi.getNAV,
    chain: HYPERLIQUID_L1_CHAIN,
  });

  const navIn18Decimals = new BigNumber(navResult.output);
  return navIn18Decimals.div(1e18).toNumber();
}

async function getPools(product) {
  const hubDeployment = product.deployments.hyperliquidL1;
  const tvlUsd = await getTvlUsd(hubDeployment.navOracle);
  const apyBase7d = await getApy7d(
    hubDeployment.navOracle,
    hubDeployment.address,
    HYPERLIQUID_L1_CHAIN
  );

  return Object.entries(product.deployments).map(([key, config]) => ({
    pool: `${config.address}-${config.chain}-${key}`.toLowerCase(),
    chain: utils.formatChain(config.chain),
    project: 'liminal-basis',
    symbol: product.symbol,
    tvlUsd,
    apyBase: apyBase7d,
    apyBase7d,
    underlyingTokens: config.underlyingTokens,
    poolMeta: product.poolMeta,
    url: 'https://liminal.money/app/tokenized',
  }));
}

async function main() {
  const pools = await Promise.all(PRODUCTS.map(getPools));

  return pools.flat().filter((p) => p.tvlUsd > 0);
}

module.exports = {
  protocolId: '6482',
  timetravel: false,
  apy: main,
  url: 'https://liminal.money/',
};
