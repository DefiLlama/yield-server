const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const { LP_ABI } = require('./abi/LP');
const { FARM } = require('./abi/FARM');
const utils = require('../utils');


const TOKENS = {
  GDEX: '0x92a212d9f5eef0b262ac7d84aea64a0d0758b94f',
  USDEX: '0x4117ec0a779448872d3820f37ba2060ae0b7c34b',
}
const SECONDS_IN_YEAR = 24 * 60 * 60 * 365;
const pairsDexswap = [
  {
    name: 'USDEX+/USDC',
    address: '0x24129a6c5b700435cc0d1bd3500796f3fb9ebd49',
  },
  {
    name: 'USDEX+/gDEX',
    address: '0x0e75ca30b075aa0df8c360e30cd0ed26ed62432a',
  }
];

const originFarms = [
  {
    symbol: 'GDEX',
    origin: '0xde1e437e0be59b596e69ff58e2bda9209a72ce8b',
    stakingToken: '0x92a212d9f5eef0b262ac7d84aea64a0d0758b94f',
    connector: '0x0b8905bb2ab1bae7b081d5b8cc9d906f01dd3b82',
    rewardToken: '0x4117ec0a779448872d3820f37ba2060ae0b7c34b',
  },
  {
    symbol: 'USDEX+/GDEX',
    origin: '0x74337fb8381ce8c323110cef2e041d0f2220a2ce',
    stakingToken: '0x0e75ca30b075aa0df8c360e30cd0ed26ed62432a',
    connector: '0xa7fbbdf114f1f2218825a500515b6bf7d49c1b2c',
    rewardToken: '0x4117ec0a779448872d3820f37ba2060ae0b7c34b',
  },
  {
    symbol: 'USDEX+/USDC',
    origin: '0x74337fb8381ce8c323110cef2e041d0f2220a2ce',
    stakingToken: '0x24129a6c5b700435cc0d1bd3500796f3fb9ebd49',
    connector: '0xc5a0676cc593f7b4a5253510bae3bad475f2c441',
    rewardToken: '0x4117ec0a779448872d3820f37ba2060ae0b7c34b',
  }
]

PROJECT_SLUG = 'dexfinance-arbitrum';

async function getDexSwapPrices() {
  const lpInfo = [];
  for (const pair of pairsDexswap) {
    const { output: reserves } = await sdk.api.abi.call({
      target: pair.address,
      abi: LP_ABI[0],
      chain: 'arbitrum',
    })
    const { output: totalSupply } = await sdk.api.abi.call({
      target: pair.address,
      abi: LP_ABI[1],
      chain: 'arbitrum',
    })
    lpInfo.push({ ...reserves, totalSupply });
  }
  const [lpInfo0, lpInfo1] = lpInfo;
  const usdcWithoutDecimalsBN = new BigNumber(lpInfo0['1']).div(10 ** 6);
  const usdexPair0PlusWithoutDecimalsBN = new BigNumber(lpInfo0['0']).div(10 ** 18);
  const gdexWithoutDecimalsBN = new BigNumber(lpInfo1['1']).div(10 ** 18);
  const usdexPair1PlusWithoutDecimalsBN = new BigNumber(lpInfo1['0']).div(10 ** 18);
  const usdexPriceUsd = usdcWithoutDecimalsBN.div(usdexPair0PlusWithoutDecimalsBN).toString();
  const totalPriceToGdexPairBN = gdexWithoutDecimalsBN.times(usdexPriceUsd);
  const priceGdexBN = usdexPair1PlusWithoutDecimalsBN.div(totalPriceToGdexPairBN);

  const totalSupply0BN = new BigNumber(lpInfo1.totalSupply).div(10 ** 18);
  const totalSupply1BN = new BigNumber(lpInfo1.totalSupply).div(10 ** 18);
  const priceLpGdexUsdex = usdexPair1PlusWithoutDecimalsBN.times(usdexPriceUsd).plus(priceGdexBN.times(gdexWithoutDecimalsBN)).div(totalSupply1BN).toString();
  const priceLpUsdcUsdexBN = usdcWithoutDecimalsBN.plus(usdexPair0PlusWithoutDecimalsBN.times(usdexPriceUsd));
  return {
    [TOKENS.GDEX]: priceGdexBN.toString(),
    [TOKENS.USDEX]: usdexPriceUsd,
    [pairsDexswap[1].address]: priceLpGdexUsdex,
    stablePairTvl:  priceLpUsdcUsdexBN.toNumber() 
  }

}

async function getGdexFarmsApy() {
  const prices = await getDexSwapPrices();
  const res = [];
  for (const origin of originFarms) {
    const { output: balance } = await sdk.api.abi.call({ chain: 'arbitrum', abi: 'erc20:balanceOf', target: origin.stakingToken, params: origin.origin });
    const isStable = origin.stakingToken === pairsDexswap[0].address;
    let tvlUsd;
    if (isStable) {
      tvlUsd = prices.stablePairTvl;
    } else {
      tvlUsd = new BigNumber(balance).div(10 ** 18).times(prices[origin.stakingToken]).toNumber();
    }
    const { output: sharePerTimeUnit } = await sdk.api.abi.call({
      target: origin.connector,
      chain: 'arbitrum',
      abi: FARM[0],
      params: [origin.rewardToken],
    });
    const rewardsPerSecondUsdBN = new BigNumber(isStable ? new BigNumber(sharePerTimeUnit).div(0.1) : sharePerTimeUnit).div(10 ** 18).times(prices[origin.rewardToken]).times(100);
    const rewardPerYearUsdBN = rewardsPerSecondUsdBN.times(SECONDS_IN_YEAR);
    const apy = rewardPerYearUsdBN.div(tvlUsd).toNumber();
    if (isStable) {
      res.push({
        pool: pairsDexswap[0].address,
        chain: utils.formatChain('arbitrum'),
        project: PROJECT_SLUG,
        symbol: pairsDexswap[0].name,
        tvlUsd,
        apy,
        url: 'https://www.dexfinance.com/',
      })
    } else {
      res.push({
        pool: origin.origin,
        chain: utils.formatChain('arbitrum'),
        project: PROJECT_SLUG,
        symbol: origin.symbol,
        tvlUsd,
        apy,
        url: 'https://www.dexfinance.com/',
      })
    }
  }
  return res;
}

module.exports = {
  apy: getGdexFarmsApy,
};
