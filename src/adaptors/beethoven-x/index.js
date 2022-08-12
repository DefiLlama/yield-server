const { request, gql } = require('graphql-request');
const Web3 = require('web3');
const utils = require('../utils');

// Subgraph URLs
const urlFantom = 'https://backend.beets-ftm-node.com/graphql';
const urlOp = 'https://backend-optimism.beets-ftm-node.com/';
const rewardToken = "fantom:0xf24bcf4d1e507740041c9cfd2dddb29585adce1e";
// aprToApy
const buildPool = (el, chainString) => {
  const symbol = el.linearPools
    ? utils.formatSymbol(
        el.linearPools.map((item) => item.mainToken.symbol).join('-')
      )
    : utils.formatSymbol(el.tokens.map((item) => item.symbol).join('-'));
  const aprFee = el.apr.items.find((e) => e.title === 'Swap fees APR');
  const aprReward = el.apr.items.find((e) => e.title !== 'Swap fees APR');
  const newObj = {
    pool: el.id,
    chain: utils.formatChain(chainString),
    project: 'beethoven-x',
    symbol: symbol,
    tvlUsd: parseFloat(el.totalLiquidity),
    apyBase: utils.aprToApy(Number(aprFee?.apr || 0)) * 100,
    apyReward: utils.aprToApy(Number(aprReward?.apr || 0)) * 100,
    rewardTokens: [rewardToken]
  };

  return newObj;
};

const main = async () => {
  const fantomData = await utils.getData(urlFantom, {
    query:
      'query { pools { id name address poolType swapFee tokensList mainTokens farmTotalLiquidity totalLiquidity totalSwapVolume totalSwapFee totalShares totalWeight owner factory amp createTime swapEnabled farm { id pair allocPoint slpBalance masterChef { id totalAllocPoint beetsPerBlock } rewarder { id rewardToken rewardPerSecond tokens { rewardPerSecond symbol token tokenPrice } } rewardTokens { decimals address rewardPerDay rewardPerSecond tokenPrice isBeets symbol } } volume24h fees24h isNewPool apr { total hasRewardApr swapApr beetsApr thirdPartyApr items { title apr subItems { title apr } } } tokens { name symbol decimals address balance weight priceRate isBpt isPhantomBpt } wrappedIndex mainIndex lowerTarget upperTarget tokenRates expiryTime stablePhantomPools { id address symbol totalSupply balance tokens { name symbol decimals address balance weight priceRate isBpt isPhantomBpt } } linearPools { id symbol address priceRate totalSupply balance mainTokenTotalBalance unwrappedTokenAddress mainToken { index address balance name symbol decimals } wrappedToken { index address balance priceRate name symbol decimals } poolToken } } }',
  });
  const opData = await utils.getData(urlOp, {
    query:
      'query { pools { id name address poolType swapFee owner factory amp tokensList totalLiquidity totalShares mainTokens isNewPool volume24h fees24h tokens { name symbol decimals address balance weight priceRate isBpt isPhantomBpt } apr { total hasRewardApr swapApr beetsApr thirdPartyApr items { title apr subItems { title apr } } } gauge { address id } } }',
  });

  const data = fantomData?.data.pools
    .filter((el) => el.totalLiquidity !== '0')
    .map((el) => buildPool(el, 'fantom'))
    .flat()
    .concat(
      opData?.data.pools
        .filter((el) => el.totalLiquidity !== '0')
        .map((el) => buildPool(el, 'optimism'))
        .flat()
    );

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://beets.fi/#/pools',
};
