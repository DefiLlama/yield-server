const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const utils = require('../utils');
const abi = require('./abi');
const addresses = require('./addresses.json');
const { default: address } = require('../paraspace-lending/address');

const secondsPerYear = 60 * 60 * 24 * 365;
const WeiPerEther = BigNumber(1000000000000000000);

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesBySymbol = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [price.symbol.toLowerCase()]: price.price,
    }),
    {}
  );

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return { pricesByAddress, pricesBySymbol };
};

const apy = async () => {
  //                                 ---------------- HLP ----------------
  const [
    { output: hlpRewardRate },
    { output: esHmxRewardRate },
    { output: hlpTotalShareUsdcRewarder },
    { output: hlpTotalShareEsHmxRewarder },
    { output: hlpStakingAumE30 },
    { output: hlpTotalSupply },
    { output: glpTotalSupply },
    { output: gmxReward },
    { output: hlpLiqUSDC },
    { output: hlpLiqSGLP },
    { output: hlpBalanceInPool },
  ] = await Promise.all([
    sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'arbitrum',
      target: addresses.hmx.FEEDABLE_REWARDER_HLP_STAKING,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'arbitrum',
      target: addresses.hmx.FEEDABLE_REWARDER_HLP_STAKING_ESHMX,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.calculateTotalShareHLP,
      chain: 'arbitrum',
      target: addresses.hmx.HLP_STAKING,
      params: [addresses.hmx.FEEDABLE_REWARDER_HLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.calculateTotalShareHLP,
      chain: 'arbitrum',
      target: addresses.hmx.HLP_STAKING,
      params: [addresses.hmx.FEEDABLE_REWARDER_HLP_STAKING_ESHMX],
    }),
    sdk.api.abi.call({
      abi: abi.getAumE30,
      chain: 'arbitrum',
      target: addresses.hmx.CALCULATOR,
      params: [false],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'arbitrum',
      target: addresses.token.HLP,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'arbitrum',
      target: addresses.token.GLP,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.tokensPerInterval,
      chain: 'arbitrum',
      target: addresses.vendor.GMX_REWARD_TRACKER,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.hlpLiquidity,
      chain: 'arbitrum',
      target: addresses.hmx.VAULT_STORAGE,
      params: [addresses.token.USDC],
    }),
    sdk.api.abi.call({
      abi: abi.hlpLiquidity,
      chain: 'arbitrum',
      target: addresses.hmx.VAULT_STORAGE,
      params: [addresses.token.GLP],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'arbitrum',
      target: addresses.token.HLP,
      params: [addresses.hmx.HLP_STAKING],
    }),
  ]);
  const { pricesBySymbol } = await getPrices([
    `arbitrum:${addresses.token.WETH}`,
    `arbitrum:${addresses.token.HMX}`,
    `arbitrum:${addresses.token.USDC}`,
    `arbitrum:${addresses.token.GLP}`,
  ]);
  const hlpPriceInE30 = BigNumber(hlpStakingAumE30).dividedBy(
    BigNumber(hlpTotalSupply)
  );
  const usdcApr = () => {
    // e18
    const usdcRewardPerYear = BigNumber(hlpRewardRate)
      .multipliedBy(secondsPerYear)
      .multipliedBy(BigNumber(10).exponentiatedBy(18 - 6));
    // e18
    const rewardInUsdPerYear = usdcRewardPerYear.multipliedBy(
      BigNumber(pricesBySymbol.usdc)
    );
    // e30 / e18 = e12
    const totalStakedHlpInUsd = BigNumber(hlpTotalShareUsdcRewarder)
      .multipliedBy(hlpPriceInE30)
      .dividedBy(WeiPerEther);
    // e18 * e2 / e12 = e6 / e6 = 0
    return rewardInUsdPerYear
      .multipliedBy(100)
      .dividedBy(totalStakedHlpInUsd)
      .dividedBy(1e6);
  };
  const glpApr = () => {
    const totalPoolValue = BigNumber(
      BigNumber(hlpLiqSGLP).multipliedBy(pricesBySymbol.sglp)
    ).plus(BigNumber(BigNumber(hlpLiqUSDC).multipliedBy(pricesBySymbol.usdc)));
    const totalSupplyUSD = BigNumber(glpTotalSupply)
      .multipliedBy(pricesBySymbol.sglp)
      .dividedBy(WeiPerEther);

    const feeGlpTrackerAnnualRewardsUsd = WeiPerEther.multipliedBy(
      secondsPerYear
    )
      .multipliedBy(BigNumber(gmxReward))
      .multipliedBy(BigNumber(pricesBySymbol.weth))
      .dividedBy(WeiPerEther);

    const glpRewardApr = feeGlpTrackerAnnualRewardsUsd
      .multipliedBy(100)
      .dividedBy(totalSupplyUSD);

    return glpRewardApr
      .multipliedBy(BigNumber(hlpLiqSGLP))
      .multipliedBy(pricesBySymbol.sglp)
      .dividedBy(WeiPerEther)
      .dividedBy(totalPoolValue);
  };
  const esHmxApr = () => {
    // e18
    const esHmxRewardPerYear =
      BigNumber(esHmxRewardRate).multipliedBy(secondsPerYear);
    // e18
    const rewardInUsdPerYear = esHmxRewardPerYear.multipliedBy(
      BigNumber(pricesBySymbol.hmx)
    );
    // e30 / e18 = e12
    const totalStakedHlpInUsd = BigNumber(hlpTotalShareEsHmxRewarder)
      .multipliedBy(hlpPriceInE30)
      .dividedBy(WeiPerEther);
    // e18 * e2 / e12 = e6 / e6 = 0
    return rewardInUsdPerYear
      .multipliedBy(100)
      .dividedBy(totalStakedHlpInUsd)
      .dividedBy(1e6);
  };
  const estimatedApy = () => {
    const totalApr = usdcApr().plus(glpApr()).plus(esHmxApr());
    const totalAprPercentage = totalApr.dividedBy(100);
    const _apy = WeiPerEther.plus(
      totalAprPercentage.multipliedBy(WeiPerEther).dividedBy(365)
    ).dividedBy(WeiPerEther);
    const apyPercentage = _apy.exponentiatedBy(365).minus(1).multipliedBy(100);
    return apyPercentage;
  };
  const tvlUsd = BigNumber(hlpBalanceInPool)
    .multipliedBy(hlpPriceInE30)
    .dividedBy(1e30);

  const hlpStakingPool = {
    pool: `${addresses.hmx.HLP_STAKING}-arbitrum`,
    chain: 'Arbitrum',
    project: 'hmx',
    symbol: 'GLP-USDC',
    tvlUsd: tvlUsd.toNumber(),
    apy: estimatedApy().toNumber(),
    rewardTokens: [addresses.token.USDC, addresses.token.ESHMX],
    underlyingTokens: [
      addresses.token.WETH,
      addresses.token.WBTC,
      addresses.token.DAI,
      addresses.token.USDC,
      addresses.token.USDT,
      addresses.token.ARB,
      addresses.token.GLP,
    ],
    poolMeta: 'HLP Staking',
    url: 'https://hmx.org/arbitrum/earn',
  };
  console.log('Obj:', hlpStakingPool);

  return [hlpStakingPool];
};

module.exports = {
  timetravel: false,
  apy: apy,
};
