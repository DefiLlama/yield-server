const sdk = require('@defillama/sdk');
const cvxCrvUtilitiesAbi = require('../cvxCrvUtilitiesAbi.json');
const abi = require('../abi.json');
const BN = require('bignumber.js');
const { getTokensPrices } = require('./token-prices');

const tricrvAddress = '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490';
const cvxCrvAddress = '0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7';
const cvxCrvUtilitiesAddress = '0xadd2F542f9FF06405Fabf8CaE4A74bD0FE29c673';

const getCvxCrvAprData = async () => {
  const [
    { output: mainRewardRates },
    { output: extraRewardRates },
  ] = await Promise.all([
    'mainRewardRates',
    'extraRewardRates',
  ].map((methodName) => (
    sdk.api.abi.call({
      target: cvxCrvUtilitiesAddress,
      abi: cvxCrvUtilitiesAbi.find((x) => x.name === methodName),
      chain: 'ethereum',
    }))
  ));

  const rewardRates = {
    groups: [
      ...mainRewardRates.groups,
      ...extraRewardRates.groups,
    ],
    rates: [
      ...mainRewardRates.rates,
      ...extraRewardRates.rates,
    ],
    tokens: [
      ...mainRewardRates.tokens,
      ...extraRewardRates.tokens,
    ],
  };

  const mergedRewardRates = rewardRates.tokens.reduce((accu, tokenAddress, i) => {
    // CvxCrvUtilities doesn't look at periodFinish: 3crv distrib is finished
    if (tokenAddress.toLowerCase() === tricrvAddress.toLowerCase()) return accu;

    const indexOfToken = accu.tokens.indexOf(tokenAddress);
    const tokenAlreadyExists = indexOfToken !== -1;

    if (tokenAlreadyExists) {
      accu.rates[indexOfToken] = accu.rates[indexOfToken].plus(BN(rewardRates.rates[i]));
    } else {
      accu.groups.push(Number(rewardRates.groups[i]));
      accu.rates.push(BN(rewardRates.rates[i]));
      accu.tokens.push(rewardRates.tokens[i]);
    }

    return accu;
  }, {
    groups: [],
    rates: [],
    tokens: [],
  });

  const rewardsTokensDecimals = (await sdk.api.abi.multiCall({
    calls: mergedRewardRates.tokens.map((address) => ({
      target: address,
      params: null,
    })),
    abi: abi.Pool.find(({ name }) => name === 'decimals'),
    chain: 'ethereum',
  })).output.map(({ output }) => Number(output));

  const tokensPrices = await getTokensPrices([...mergedRewardRates.tokens, cvxCrvAddress]);
  const cvxCrvPrice = tokensPrices[cvxCrvAddress.toLowerCase()];

  const mainRewards = mergedRewardRates.tokens.map((tokenAddress, i) => {
    const rewardCoinDecimals = rewardsTokensDecimals[i];
    const rateBN = mergedRewardRates.rates[i].div(10 ** rewardCoinDecimals);
    const rewardCoinPrice = tokensPrices[tokenAddress.toLowerCase()];

    const apr = rateBN
      .times(rewardCoinPrice)
      .div(cvxCrvPrice)
      .times(86400 * 365)
      .times(100);

    return {
      token: tokenAddress,
      apr,
      group: mergedRewardRates.groups[i],
    };
  });

  const totalGroup0Apr = BN.sum(...mainRewards.filter(({ group }) => group === 0).map(({ apr }) => apr)).dp(2).toNumber();
  const totalGroup1Apr = BN.sum(...mainRewards.filter(({ group }) => group === 1).map(({ apr }) => apr)).dp(2).toNumber();

  return Math.max(totalGroup0Apr, totalGroup1Apr);
};

module.exports = {
  getCvxCrvAprData,
};
