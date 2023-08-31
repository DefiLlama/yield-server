const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const abi = require('./abi');
const addresses = require('./addresses.json');

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
    { output: hlpRewardRateHlpPool },
    { output: hmxRewardRateHmxPool },
    { output: esHmxRewardRateHmxPool },
    { output: plpRewardRate },
    { output: dragonPointRewardRateHmxPool },
    { output: hlpTotalShareUsdcRewarder },
    { output: hmxTotalShareUsdcRewarder },
    { output: hmxTotalShareEsHmxRewarder },
    { output: hmxTotalShareDragonPointRewarder },
    { output: hlpStakingAumE30 },
    { output: hlpTotalSupply },
    { output: glpTotalSupply },
    { output: gmxReward },
    { output: hlpLiqUSDC },
    { output: hlpLiqSGLP },
    { output: hlpBalanceInPool },
    { output: hmxBalanceInPool },
    { output: aumE18 },
    { output: plpAmountInStaking },
    { output: plpTotalSupply },
  ] = await Promise.all([
    sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'arbitrum',
      target: addresses.FEEDABLE_REWARDER_HLP_STAKING,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'arbitrum',
      target: addresses.FEEDABLE_REWARDER_HMX_STAKING,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'arbitrum',
      target: addresses.FEEDABLE_REWARDER_HMX_STAKING_ESHMX,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'polygon',
      target: addresses.PROTOCOL_REVENUE_REWARDER,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.rewardRate,
      chain: 'arbitrum',
      target: addresses.FEEDABLE_REWARDER_HMX_STAKING_DRAPGON_POINT,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.calculateTotalShare,
      chain: 'arbitrum',
      target: addresses.HLP_STAKING,
      params: [addresses.FEEDABLE_REWARDER_HLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.calculateTotalShare,
      chain: 'arbitrum',
      target: addresses.HMX_STAKING,
      params: [addresses.FEEDABLE_REWARDER_HMX_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.calculateTotalShare,
      chain: 'arbitrum',
      target: addresses.HMX_STAKING,
      params: [addresses.FEEDABLE_REWARDER_HMX_STAKING_ESHMX],
    }),
    sdk.api.abi.call({
      abi: abi.calculateTotalShare,
      chain: 'arbitrum',
      target: addresses.HMX_STAKING,
      params: [addresses.FEEDABLE_REWARDER_HMX_STAKING_DRAPGON_POINT],
    }),
    sdk.api.abi.call({
      abi: abi.getAumE30,
      chain: 'arbitrum',
      target: addresses.CALCULATOR,
      params: [false],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'arbitrum',
      target: addresses.HLP,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'arbitrum',
      target: addresses.GLP,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.tokensPerInterval,
      chain: 'arbitrum',
      target: addresses.GMX_REWARD_TRACKER,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.hlpLiquidity,
      chain: 'arbitrum',
      target: addresses.VAULT_STORAGE,
      params: [addresses.USDC],
    }),
    sdk.api.abi.call({
      abi: abi.hlpLiquidity,
      chain: 'arbitrum',
      target: addresses.VAULT_STORAGE,
      params: [addresses.GLP],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'arbitrum',
      target: addresses.HLP,
      params: [addresses.HLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'arbitrum',
      target: addresses.HMX,
      params: [addresses.HMX_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.getAumE18,
      chain: 'polygon',
      target: addresses.POOL_DIAMOND_CONTRACT,
      params: [true],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'polygon',
      target: addresses.PLP,
      params: [addresses.PLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'polygon',
      target: addresses.PLP,
      params: [],
    }),
  ]);
  const { pricesBySymbol } = await getPrices([
    `arbitrum:${addresses.WETH}`,
    `arbitrum:${addresses.HMX}`,
    `arbitrum:${addresses.USDC}`,
    `arbitrum:${addresses.GLP}`,
  ]);
  const hlpPriceInE30 = BigNumber(hlpStakingAumE30).dividedBy(
    BigNumber(hlpTotalSupply)
  );
  const usdcAprHlp = () => {
    // e18
    const usdcRewardPerYear = BigNumber(hlpRewardRateHlpPool)
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
  const glpAprHlp = () => {
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
      .multipliedBy(BigNumber(hlpLiqSGLP)) // e18
      .multipliedBy(pricesBySymbol.sglp)
      .multipliedBy(1e12) // e12
      .dividedBy(WeiPerEther)
      .dividedBy(hlpStakingAumE30); // e30; 0
  };
  const totalApr = usdcAprHlp().plus(glpAprHlp());
  const tvlUsdHlp = BigNumber(hlpBalanceInPool)
    .multipliedBy(hlpPriceInE30)
    .dividedBy(1e30);

  const hlpStakingPool = {
    pool: `${addresses.HLP_STAKING}-arbitrum`,
    chain: 'Arbitrum',
    project: 'hmx',
    symbol: 'GLP-USDC',
    tvlUsd: tvlUsdHlp.toNumber(),
    apyBase: totalApr.toNumber(),
    rewardTokens: [addresses.USDC, addresses.ESHMX],
    underlyingTokens: [
      addresses.WETH,
      addresses.WBTC,
      addresses.DAI,
      addresses.USDC,
      addresses.USDT,
      addresses.ARB,
      addresses.GLP,
    ],
    poolMeta: 'HLP Staking',
    url: 'https://hmx.org/arbitrum/earn',
  };
  //                                 ---------------- HMX ----------------
  const usdcAprHmx = () => {
    // e18
    const usdcRewardPerYear = BigNumber(hmxRewardRateHmxPool)
      .multipliedBy(secondsPerYear)
      .multipliedBy(BigNumber(10).exponentiatedBy(18 - 6));
    // e18
    const rewardInUsdPerYear = usdcRewardPerYear.multipliedBy(
      BigNumber(pricesBySymbol.usdc)
    );
    // e30 / e18 = e12
    const totalStakedHmxInUsd = BigNumber(hmxTotalShareUsdcRewarder)
      .multipliedBy(pricesBySymbol.hmx)
      .dividedBy(WeiPerEther);
    // e18 * e2 = e20 / e12 = e18 / e18 = 0
    return rewardInUsdPerYear
      .multipliedBy(100)
      .dividedBy(totalStakedHmxInUsd)
      .dividedBy(WeiPerEther);
  };
  const esHmxAprHmx = () => {
    // e18
    const esHmxRewardPerYear = BigNumber(esHmxRewardRateHmxPool).multipliedBy(
      secondsPerYear
    );
    // e18
    const rewardInUsdPerYear = esHmxRewardPerYear.multipliedBy(
      BigNumber(pricesBySymbol.hmx)
    );
    // e30 / e18 = e12
    const totalStakedHmxInUsd = BigNumber(hmxTotalShareEsHmxRewarder)
      .multipliedBy(pricesBySymbol.hmx)
      .dividedBy(WeiPerEther);
    // e18 * e2 = e20 / e12 = e18 / e18 = 0
    return rewardInUsdPerYear
      .multipliedBy(100)
      .dividedBy(totalStakedHmxInUsd)
      .dividedBy(WeiPerEther);
  };
  const tvlUsdHmx = BigNumber(hmxBalanceInPool)
    .multipliedBy(pricesBySymbol.hmx)
    .dividedBy(1e18);
  const hmxStakingPool = {
    pool: `${addresses.HMX_STAKING}-arbitrum`,
    chain: 'Arbitrum',
    project: 'hmx',
    symbol: 'HMX-esHMX',
    tvlUsd: tvlUsdHmx.toNumber(),
    apyBase: usdcAprHmx().toNumber(),
    apyReward: esHmxAprHmx().toNumber(),
    rewardTokens: [addresses.USDC, addresses.ESHMX, addresses.DRAGON_POINT],
    underlyingTokens: [addresses.ESHMX, addresses.HMX],
    poolMeta: 'HMX Staking - 1 year linest vest',
    url: 'https://hmx.org/arbitrum/earn',
  };
  //                                 ---------------- PLP ----------------
  const { pricesBySymbol: polygonPricesBySymbol } = await getPrices([
    `polygon:${addresses.USDC_POLYGON}`,
  ]);
  const tvl = () => {
    const aumBn = BigNumber(aumE18).dividedBy(
      BigNumber(10).exponentiatedBy(18)
    );
    const plpAmountInStakingBn = BigNumber(plpAmountInStaking).dividedBy(
      BigNumber(10).exponentiatedBy(18)
    );
    const plpTotalSupplyBn = BigNumber(plpTotalSupply).dividedBy(
      BigNumber(10).exponentiatedBy(18)
    );

    return aumBn.multipliedBy(plpAmountInStakingBn).dividedBy(plpTotalSupplyBn);
  };
  const apr = () => {
    const rewardRatePerSecondBn = BigNumber(plpRewardRate).dividedBy(
      BigNumber(10).exponentiatedBy(6)
    );
    const rewardValuePerSecond = rewardRatePerSecondBn.multipliedBy(
      polygonPricesBySymbol.usdc
    );
    const rewardValuePerYear =
      rewardValuePerSecond.multipliedBy(secondsPerYear);
    return rewardValuePerYear.multipliedBy(100).dividedBy(tvl());
  };

  const plpStakingPool = {
    pool: `${addresses.PLP_STAKING}-polygon`,
    chain: 'Polygon',
    project: 'hmx',
    symbol: 'USDC-USDT-WBTC-ETH-MATIC',
    tvlUsd: tvl().toNumber(),
    apy: apr().toNumber(),
    rewardTokens: [addresses.USDC_POLYGON],
    underlyingTokens: [
      addresses.USDC_POLYGON,
      addresses.USDT_POLYGON,
      addresses.WBTC_POLYGON,
      addresses.WMATIC_POLYGON,
      addresses.WETH_POLYGON,
    ],
    poolMeta: 'PLP Staking',
    url: 'https://legacy.hmx.org/polygon/earn',
  };

  return [hlpStakingPool, hmxStakingPool, plpStakingPool];
};

module.exports = {
  timetravel: false,
  apy: apy,
};
