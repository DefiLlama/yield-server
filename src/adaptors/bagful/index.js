const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

let tokenInfoMapping = {
  0: {
    symbol: 'MENDI',
    decimals: 18,
    isFixedRate: false,
    rewardTokens: ['0xA219439258ca9da29E9Cc4cE5596924745e12B93'],
    dailyRewardAmount: 18,
    rewardTokenPriceKey: 'USDT',
    priceKey: 'MENDI',
  },
  1: {
    symbol: 'USDT',
    decimals: 6,
    isFixedRate: true,
    fixedRate: 0.213,
    rewardTokens: ['0xA219439258ca9da29E9Cc4cE5596924745e12B93'],
    dailyRewardAmount: 6,
    rewardTokenPriceKey: 'USDT',
    priceKey: 'USDT',
  },
  2: {
    symbol: 'USDC',
    decimals: 6,
    isFixedRate: true,
    fixedRate: 0.525,
    rewardTokens: ['0x176211869cA2b568f2A7D4EE941E073a821EE1ff'],
    rewardTokenPriceKey: 'USDC',
    priceKey: 'USDC',
  },
  3: {
    symbol: 'DAI',
    decimals: 18,
    isFixedRate: true,
    fixedRate: 0.152,
    rewardTokens: ['0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5'],
    rewardTokenPriceKey: 'DAI',
    priceKey: 'DAI',
  },
  4: {
    symbol: 'WETH',
    decimals: 18,
    isFixedRate: true,
    fixedRate: 0.172,
    rewardTokens: ['0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'],
    rewardTokenPriceKey: 'WETH',
    priceKey: 'WETH',
  },
  5: {
    symbol: 'WBTC',
    decimals: 8,
    isFixedRate: true,
    fixedRate: 0.017,
    rewardTokens: ['0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4'],
    rewardTokenPriceKey: 'WBTC',
    priceKey: 'WBTC',
  },
};

const AGGREGATOR_ADDRESS = '0x6bD057Dae9aA5aE05c782F2eB988CBdE53Be9620';
const PRICE_API = 'https://bagful.io/farmData.json';

const apy = async () => {
  let abi = sdk.api.abi;
  let { tokenPrices } = await utils.getData(PRICE_API);

  let { output: pools } = await abi.call({
    target: AGGREGATOR_ADDRESS,
    abi: abiJSON.getPoolTvl,
    chain: 'linea',
  });
  let apyInfos = [];
  for (const pid in tokenInfoMapping) {
    const token = tokenInfoMapping[pid];
    let pool = pools.find((pool) => pool.pid === pid);
    if (pool === undefined) {
      continue;
    }
    let apy;
    let tvlUsd = BigNumber(pool.tvl)
      .div(Math.pow(10, token.decimals))
      .multipliedBy(tokenPrices[token.priceKey])
      .toNumber();

    if (token.isFixedRate) {
      apy = token.fixedRate;
    } else {
      apy =
        tvlUsd === 0
          ? '0'
          : (token.dailyRewardAmount *
              tokenPrices[token.rewardTokenPriceKey] *
              365) /
            tvlUsd;
    }

    apyInfos.push({
      chain: 'linea',
      project: 'Bagful',
      pool: pool.poolAddress,
      symbol: token.symbol,
      underlyingTokens: [pool.poolAssets],
      tvlUsd,
      apy,
    });
  }
  return apyInfos;
};

let abiJSON = {
  getPoolTvl:
    'function getPoolTotalTvl() view returns (tuple(uint256 pid, address poolAddress,address poolAssets, uint256 tvl)[])',
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://bagful.io',
};
