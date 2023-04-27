const utils = require('../utils');

const getApy = async () => {
  const stakePrizePoolData = {
    pool: '0x82D24dD5041A3Eb942ccA68B319F1fDa9EB0c604', // StakePrizePool
    chain: utils.formatChain('ethereum'),
    project: 'asymetrix-protocol',
    symbol: utils.formatSymbol('ASX'),
    tvlUsd: await utils.getData('https://api.llama.fi/tvl/asymetrix-protocol/'),
    apyReward: (await utils.getData('https://api.asymetrix.io/apy/')).data.apr,
    rewardTokens: ['0x67d85A291fcDC862A78812a3C26d55e28FFB2701'], // [ASX]
    underlyingTokens: ['0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84'], // [stETH]
    url: 'https://app.asymetrix.io/',
  };

  return [stakePrizePoolData];
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
