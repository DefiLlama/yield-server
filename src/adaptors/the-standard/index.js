const utils = require('../utils');

const hypervisors = [
  {
    address: '0x547a116a2622876ce1c8d19d41c683c8f7bec5c0',
    pair: [
      ['USDs', '0x2Ea0bE86990E8Dac0D09e4316Bb92086F304622d'],
      ['USDC', '0xaf88d065e77c8cC2239327C5EDb3A432268e5831']
    ],
  },
  {
    address: '0x52ee1ffba696c5e9b0bc177a9f8a3098420ea691',
    pair: [
      ['WETH', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1'],
      ['WBTC', '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f']
    ],
  },
  {
    address: '0x330dfc5bc1a63a1dcf1cd5bc9ad3d5e5e61bcb6c',
    pair: [
      ['ARB', '0x912CE59144191C1204E64559FE8253a0e49E6548'],
      ['WETH', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1']
    ],
  },
  {
    address: '0xfa392dbefd2d5ec891ef5aeb87397a89843a8260',
    pair: [
      ['LINK', '0xf97f4df75117a78c1A5a0DBb814Af92458539FB4'],
      ['WETH', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1']
    ],
  },
  {
    address: '0xf08bdbc590c59cb7b27a8d224e419ef058952b5f',
    pair: [
      ['GMX', '0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a'],
      ['WETH', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1']
    ],
  },
  {
    address: '0x2bcbdd577616357464cfe307bc67f9e820a66e80',
    pair: [
      ['RDNT', '0x3082CC23568eA640225c2467653dB90e9250AaA0'],
      ['WETH', '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1']
    ],
  },
];

const allDataURL = 'https://api.gamma.xyz/frontend/hypervisors/allDataSummary';

const handleApy = async () => {
  const standardApy = [];
  const allData = await utils.getData(allDataURL);

  hypervisors.forEach((hypervisor) => {
    const itemData = allData?.find((item) => item?.address === hypervisor?.address);
    const rewardTokens = itemData && itemData?.rewardsDetails && itemData?.rewardsDetails.map((item) => {
      return item.rewardToken
    });
    
    const symbol = `${hypervisor?.pair[0][0]}-${hypervisor?.pair[1][0]}`;
    const useData = {
      pool: `${itemData?.address}-arbitrum`.toLowerCase(),
      chain: 'Arbitrum',
      project: 'the-standard',
      symbol: symbol,
      tvlUsd: Number(itemData?.tvlUSD),
      apyBase: Number(itemData?.feeApr),
      apyReward: Number(itemData?.rewardApr),
      rewardTokens: [...new Set(rewardTokens)],
      underlyingTokens: [hypervisor?.pair[0][1], hypervisor?.pair[1][1]],
    }
    standardApy.push(useData);
  })

  return standardApy;
};

module.exports = {
  timetravel: false,
  apy: handleApy,
  url: 'https://app.thestandard.io/',
};