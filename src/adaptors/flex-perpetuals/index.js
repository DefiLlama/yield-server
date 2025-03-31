const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const abi = require('./abi');
const addresses = require('./addresses.json');
const utils = require('../utils');

const WeiPerEther = BigNumber(1000000000000000000);

const baseUrl = 'https://gapi.flex.trade/v1/apr-pools';

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
  const [
    baseResponse,
    { pricesBySymbol },
    { output: flpStakingAumE30Base },
    { output: flpTotalSupplyBase },
    { output: flpBalanceInPoolBase },
    { output: esfdxBalanceInPool },
    { output: lfdxBalanceInPool },
    { output: fdxBalanceInLP },
    { output: aerolpBalanceInPool },
    { output: aerolpTotalSupply },
  ] = await Promise.all([
    utils.getData(baseUrl),
    getPrices([`base:${addresses.FDX}`]),
    sdk.api.abi.call({
      abi: abi.getAumE30,
      chain: 'base',
      target: addresses.CALCULATOR,
      params: [false],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'base',
      target: addresses.FLP,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'base',
      target: addresses.FLP,
      params: [addresses.FLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'base',
      target: addresses.ESFDX,
      params: [addresses.FDX_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'base',
      target: addresses.LFDX,
      params: [addresses.FDX_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'base',
      target: addresses.FDX,
      params: [addresses.AEROLP],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'base',
      target: addresses.AEROLP,
      params: [addresses.STFDXLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'base',
      target: addresses.AEROLP,
      params: [],
    }),
  ]);

  // ---------------- Base ----------------
  const { aprPools: baseAprPools } = baseResponse.data;

  const baseFlpApr = baseAprPools.find((p) => p.key === 'flp_staking');
  const baseFlpAprBase = () => {
    if (!baseFlpApr || !baseFlpApr.Info) return BigNumber(0);

    const _baseFlpAprBase = baseFlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken == 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_baseFlpAprBase).dividedBy(WeiPerEther);
  };

  const baseFlpAprReward = () => {
    if (!baseFlpApr || !baseFlpApr.Info) return BigNumber(0);

    const _baseFlpAprReward = baseFlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken != 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_baseFlpAprReward).dividedBy(WeiPerEther);
  };

  const baseStFdxlpApr = baseAprPools.find((p) => p.key === 'stfdxlp_staking');
  const baseStFdxlpAprBase = () => {
    if (!baseStFdxlpApr || !baseStFdxlpApr.Info) return BigNumber(0);

    const _baseStFdxlpAprBase = baseStFdxlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken == 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_baseStFdxlpAprBase).dividedBy(WeiPerEther);
  };

  const baseStFdxlpAprReward = () => {
    if (!baseStFdxlpApr || !baseStFdxlpApr.Info) return BigNumber(0);

    const _baseStFdxlpAprReward = baseStFdxlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken != 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_baseStFdxlpAprReward).dividedBy(WeiPerEther);
  };

  const baseFdxApr = baseAprPools.find((p) => p.key === 'fdx_staking');
  const baseFdxAprBase = () => {
    if (!baseFdxApr || !baseFdxApr.Info) return BigNumber(0);

    const _baseFdxAprBase = baseFdxApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken == 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_baseFdxAprBase).dividedBy(WeiPerEther);
  };

  const baseFdxAprReward = () => {
    if (!baseFdxApr || !baseFdxApr.Info) return BigNumber(0);

    const _baseFdxAprReward = baseFdxApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken != 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_baseFdxAprReward).dividedBy(WeiPerEther);
  };

  // ---------------- FLP ----------------
  const flpPriceInE30Base = BigNumber(flpStakingAumE30Base).dividedBy(
    BigNumber(flpTotalSupplyBase)
  );

  const tvlUsdFlpBase = BigNumber(flpBalanceInPoolBase)
    .multipliedBy(flpPriceInE30Base)
    .dividedBy(1e30);

  const flpStakingPool = {
    pool: `${addresses.FLP_STAKING}-base`,
    chain: 'base',
    project: 'flex-perpetuals',
    symbol: 'ETH-BTC-USDC',
    tvlUsd: tvlUsdFlpBase.toNumber(),
    apyBase: baseFlpAprBase().toNumber(),
    apyReward: baseFlpAprReward().toNumber(),
    rewardTokens: [addresses.USDC, addresses.ESFDX],
    underlyingTokens: [addresses.WETH, addresses.WBTC, addresses.USDC],
    poolMeta: 'FLP Staking',
    url: 'https://app.flex.trade/base/earn',
  };

  // ---------------- FDX ----------------
  console.log("PRICE =========================================", pricesBySymbol.fdx, esfdxBalanceInPool);
  const tvlUsdFdx = BigNumber(esfdxBalanceInPool)
    .plus(lfdxBalanceInPool)
    .multipliedBy(pricesBySymbol.fdx)
    .dividedBy(WeiPerEther);

  const fdxStakingPool = {
    pool: `${addresses.FDX_STAKING}-base`,
    chain: 'base',
    project: 'flex-perpetuals',
    symbol: 'FDX-esFDX',
    tvlUsd: tvlUsdFdx.toNumber(),
    apyBase: baseFdxAprBase().toNumber(),
    apyReward: baseFdxAprReward().toNumber(),
    rewardTokens: [addresses.USDC, addresses.ESFDX],
    underlyingTokens: [addresses.ESFDX, addresses.FDX],
    poolMeta: 'FDX Staking - esFDX reward is 1 year linear vested',
    url: 'https://app.flex.trade/base/earn',
  };


  // ---------------- STFDXLP ----------------
  console.log("STFDXLP =========================================", pricesBySymbol.fdx, fdxBalanceInLP, aerolpBalanceInPool, aerolpTotalSupply);
  const tvlUsdstfdxlpBase = BigNumber(fdxBalanceInLP)
    .multipliedBy(pricesBySymbol.fdx)
    .multipliedBy(2)
    .multipliedBy(aerolpBalanceInPool)
    .dividedBy(aerolpTotalSupply)
    .dividedBy(WeiPerEther);

  const stfdxlpStakingPool = {
    pool: `${addresses.STFDXLP_STAKING}-base`,
    chain: 'base',
    project: 'flex-perpetuals',
    symbol: 'StFdxLp',
    tvlUsd: tvlUsdstfdxlpBase.toNumber(),
    apyBase: baseStFdxlpAprBase().toNumber(),
    apyReward: baseStFdxlpAprReward().toNumber(),
    rewardTokens: [addresses.USDC, addresses.ESFDX],
    underlyingTokens: [addresses.STFDXLP],
    poolMeta: 'stFdxLP Staking',
    url: 'https://app.flex.trade/base/earn',
  };

  return [flpStakingPool, fdxStakingPool, stfdxlpStakingPool];
};

module.exports = {
  timetravel: false,
  apy: apy,
};
