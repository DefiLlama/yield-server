const sdk = require('@defillama/sdk');
const utils = require('../utils');
const BigNumber = require('bignumber.js');

const IRewardVaultABI = require('./abi/IRewardVault.json');
const IBaseLendingPoolABI = require('./abi/IBaseLendingPool.json');

const poolListEndpoint = 'https://graph.stellaxyz.io/api/rest/lending-pools';
const rewardRateEndpoint =
  'https://blocks.alphainnovationslab.io/lm-lender/reward_rates';
const priceEndpoint = 'https://coins.llama.fi/prices/current/';

const rewardVaultAddress = '0xa67CF61b0b9BC39c6df04095A118e53BFb9303c7';
const alphaTokenAddressARB = '0xc9cbf102c73fb77ec14f8b4c8bd88e050a6b2646';
const alphaTokenAddressETH = '0xa1faa113cbe53436df28ff0aee54275c13b40975';
const alphaTokenPriceKey = `ethereum:${alphaTokenAddressETH}`;

const SEC_IN_YEAR = 365 * 24 * 60 * 60;

const apy = async () => {
  const result = [];

  const { pools } = await utils.getData(poolListEndpoint);
  const { data: rewardRate } = await utils.getData(rewardRateEndpoint);
  const priceData = await utils.getData(
    priceEndpoint +
      pools
        .map((p) => `arbitrum:${p.underlyingToken}`)
        .concat(alphaTokenPriceKey)
        .join(',') +
      '?searchWidth=4h'
  );

  const { output: rewardDistribution } = await sdk.api.abi.call({
    target: rewardVaultAddress,
    abi: IRewardVaultABI.find((m) => m.name === 'rewardDistribution'),
    chain: 'arbitrum',
  });

  const dailyRewardVaultRate = new BigNumber(
    rewardDistribution.dailyRewardDistributionRateE18
  );

  for (const pool of pools) {
    const { output: rewardVaultBalance } = await sdk.api.erc20.balanceOf({
      target: pool.underlyingToken,
      owner: rewardVaultAddress,
      chain: 'arbitrum',
    });

    const { output: totalAssets } = await sdk.api.abi.call({
      target: pool.poolAddress,
      abi: IBaseLendingPoolABI.find((m) => m.name === 'totalAssets'),
      chain: 'arbitrum',
    });

    const { output: totalDebts } = await sdk.api.abi.call({
      target: pool.poolAddress,
      abi: IBaseLendingPoolABI.find((m) => m.name === 'totalDebts'),
      chain: 'arbitrum',
    });

    const { output: decimals } = await sdk.api.erc20.decimals(
      pool.underlyingToken,
      'arbitrum'
    );

    const baseApy = dailyRewardVaultRate
      .div('1e18')
      .times(rewardVaultBalance)
      .div(totalAssets)
      .plus(1)
      .pow(365)
      .minus(1);

    const underlyingTokenPrice =
      priceData?.coins[`arbitrum:${pool.underlyingToken.toLowerCase()}`].price;

    const tvlUsd = new BigNumber(totalAssets)
      .minus(totalDebts)
      .times(underlyingTokenPrice)
      .div(`1e${decimals}`);

    const rewardRatePerSecE18 =
      rewardRate.reward_rate_per_sec_e18[pool.poolAddress.toLowerCase()];
    const alphaPrice =
      priceData?.coins['ethereum:0xa1faa113cbe53436df28ff0aee54275c13b40975']
        .price;

    let res = {
      pool: `${pool.poolAddress}-arbitrum`,
      chain: utils.formatChain('arbitrum'),
      project: 'stella',
      symbol: pool.poolName,
      tvlUsd: tvlUsd.toNumber(),
      totalSupplyUsd: new BigNumber(totalAssets)
        .times(underlyingTokenPrice)
        .div(`1e${decimals}`)
        .toNumber(),
      totalBorrowUsd: new BigNumber(totalDebts)
        .times(underlyingTokenPrice)
        .div(`1e${decimals}`)
        .toNumber(),
      apyBase: baseApy.times(100).toNumber(),
      underlyingTokens: [pool.underlyingToken],
      url: `https://app.stellaxyz.io/lending/${pool.poolAddress}?action=deposit`,
    };

    if (rewardRatePerSecE18 && alphaPrice && underlyingTokenPrice) {
      const totalRewardValue = new BigNumber(rewardRatePerSecE18)
        .times(alphaPrice)
        .times(SEC_IN_YEAR);

      const rewardApy = totalRewardValue
        .div(totalAssets)
        .times(`1e${decimals}`)
        .div('1e18')
        .div(underlyingTokenPrice);

      const rewardTokens = [alphaTokenAddressARB];

      res = {
        ...res,
        apyReward: rewardApy.times(100).toNumber(),
        rewardTokens,
      };
    }

    result.push(res);
  }

  return result;
};

module.exports = apy;
