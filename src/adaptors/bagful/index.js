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
    url: 'https://bagful.io/vault/0x75f732857B3684D5d9244889E080dC4f23afC3Bc/0x43e8809ea748eff3204ee01f08872f063e44065',
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
    url: 'https://bagful.io/vault/0xf155966a727D397c511C0079fDe30AdBF494F8FF/0xA219439258ca9da29E9Cc4cE5596924745e12B93',
  },
  2: {
    symbol: 'USDC',
    decimals: 6,
    isFixedRate: true,
    fixedRate: 0.525,
    rewardTokens: ['0x176211869cA2b568f2A7D4EE941E073a821EE1ff'],
    rewardTokenPriceKey: 'USDC',
    priceKey: 'USDC',
    url: 'https://bagful.io/vault/0x7EF04aCA3F9F4F7D30F06B5B9e9aa82EA7B2Af55/0x176211869cA2b568f2A7D4EE941E073a821EE1ff',
  },
  3: {
    symbol: 'DAI',
    decimals: 18,
    isFixedRate: true,
    fixedRate: 0.152,
    rewardTokens: ['0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5'],
    rewardTokenPriceKey: 'DAI',
    priceKey: 'DAI',
    url: 'https://bagful.io/vault/0xdD01Ac6d0269dff719560752C84AA24C80FbC16E/0x4AF15ec2A0BD43Db75dd04E62FAA3B8EF36b00d5',
  },
  4: {
    symbol: 'WETH',
    decimals: 18,
    isFixedRate: true,
    fixedRate: 0.172,
    rewardTokens: ['0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f'],
    rewardTokenPriceKey: 'WETH',
    priceKey: 'WETH',
    url: 'https://bagful.io/vault/0x0C91D775c99F348eAD2F8ee13D82dADC06f50135/0xe5D7C2a44FfDDf6b295A15c148167daaAf5Cf34f',
  },
  5: {
    symbol: 'WBTC',
    decimals: 8,
    isFixedRate: true,
    fixedRate: 0.017,
    rewardTokens: ['0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4'],
    rewardTokenPriceKey: 'WBTC',
    priceKey: 'WBTC',
    url: 'https://bagful.io/vault/0xD6CF3a48C337B687E4ffa492f82A01493b5F438f/0x3aAB2285ddcDdaD8edf438C1bAB47e1a9D05a9b4',
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
    apy = (apy * 100).toFixed(2).toString() + '%';

    apyInfos.push({
      chain: 'linea',
      project: 'bagful',
      pool: pool.poolAddress,
      symbol: token.symbol,
      underlyingTokens: [pool.poolAssets],
      tvlUsd,
      apy,
      url: token.url,
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
