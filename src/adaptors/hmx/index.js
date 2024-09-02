const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');

const abi = require('./abi');
const addresses = require('./addresses.json');
const utils = require('../utils');

const WeiPerEther = BigNumber(1000000000000000000);

const arbUrl = 'https://arbitrum-gapi.hmx.org/v1/apr-pools';
const blastUrl = 'https://blast-gapi.hmx.org/v1/apr-pools';

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
    arbResponse,
    blastResponse,
    { pricesBySymbol },
    { output: hlpStakingAumE30Arb },
    { output: hlpTotalSupplyArb },
    { output: hlpBalanceInPoolArb },
    { output: hlpStakingAumE30Blast },
    { output: hlpTotalSupplyBlast },
    { output: hlpBalanceInPoolBlast },
    { output: hmxBalanceInPool },
  ] = await Promise.all([
    utils.getData(arbUrl),
    utils.getData(blastUrl),
    getPrices([`arbitrum:${addresses.HMX}`]),
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
      abi: abi.balanceOf,
      chain: 'arbitrum',
      target: addresses.HLP,
      params: [addresses.HLP_STAKING],
    }),
    sdk.api.abi.call({
      abi: abi.getAumE30,
      chain: 'blast',
      target: addresses.CALCULATOR_BLAST,
      params: [false],
    }),
    sdk.api.abi.call({
      abi: abi.totalSupply,
      chain: 'blast',
      target: addresses.HLP_BLAST,
      params: [],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'blast',
      target: addresses.HLP_BLAST,
      params: [addresses.HLP_STAKING_BLAST],
    }),
    sdk.api.abi.call({
      abi: abi.balanceOf,
      chain: 'arbitrum',
      target: addresses.HMX,
      params: [addresses.HMX_STAKING],
    }),
  ]);

  //                                 ---------------- Arbitrum ----------------
  const { aprPools: arbAprPools } = arbResponse.data;

  const arbHlpApr = arbAprPools.find((p) => p.key === 'hlp_staking');
  const arbHlpAprBase = () => {
    if (!arbHlpApr || !arbHlpApr.Info) return BigNumber(0);

    const _arbHlpAprBase = arbHlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken == 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_arbHlpAprBase).dividedBy(WeiPerEther);
  };

  const arbHlpAprReward = () => {
    if (!arbHlpApr || !arbHlpApr.Info) return BigNumber(0);

    const _arbHlpAprReward = arbHlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken != 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_arbHlpAprReward).dividedBy(WeiPerEther);
  };

  const arbHmxApr = arbAprPools.find((p) => p.key === 'hmx_staking');
  const arbHmxAprBase = () => {
    if (!arbHmxApr || !arbHmxApr.Info) return BigNumber(0);

    const _arbHmxAprBase = arbHmxApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken == 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_arbHmxAprBase).dividedBy(WeiPerEther);
  };

  const arbHmxAprReward = () => {
    if (!arbHmxApr || !arbHmxApr.Info) return BigNumber(0);

    const _arbHmxAprReward = arbHmxApr.Info.reduce((acc, apr) => {
      if (apr.rewardToken != 'usdc') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_arbHmxAprReward).dividedBy(WeiPerEther);
  };

  // //                                 ---------------- Blast ----------------
  const { aprPools: blastAprPools } = blastResponse.data;

  const blastHlpApr = blastAprPools.find((p) => p.key === 'hlp_staking');
  const blastHlpAprBase = () => {
    if (!blastHlpApr || !blastHlpApr.Info) return BigNumber(0);

    const _blastHlpAprBase = blastHlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardName == 'HLP Staking Protocol Revenue') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_blastHlpAprBase).dividedBy(WeiPerEther);
  };

  const blastHlpAprReward = () => {
    if (!blastHlpApr || !blastHlpApr.Info) return BigNumber(0);

    const _blastHlpAprReward = blastHlpApr.Info.reduce((acc, apr) => {
      if (apr.rewardName != 'HLP Staking Protocol Revenue') {
        acc += apr.apr;
      }
      return acc;
    }, 0);

    return BigNumber(_blastHlpAprReward).dividedBy(WeiPerEther);
  };

  //                                 ---------------- HLP ----------------
  const hlpPriceInE30Arb = BigNumber(hlpStakingAumE30Arb).dividedBy(
    BigNumber(hlpTotalSupplyArb)
  );

  const tvlUsdHlpArb = BigNumber(hlpBalanceInPoolArb)
    .multipliedBy(hlpPriceInE30Arb)
    .dividedBy(1e30);

  const hlpPriceInE30Blast = BigNumber(hlpStakingAumE30Blast).dividedBy(
    BigNumber(hlpTotalSupplyBlast)
  );

  const tvlUsdHlpBlast = BigNumber(hlpBalanceInPoolBlast)
    .multipliedBy(hlpPriceInE30Blast)
    .dividedBy(1e30);

  const hlpStakingPoolArb = {
    pool: `${addresses.HLP_STAKING}-arbitrum`,
    chain: 'Arbitrum',
    project: 'hmx',
    symbol: 'ETH-BTC-USDC',
    tvlUsd: tvlUsdHlpArb.toNumber(),
    apyBase: arbHlpAprBase().toNumber(),
    apyReward: arbHlpAprReward().toNumber(),
    rewardTokens: [addresses.USDC, addresses.ESHMX],
    underlyingTokens: [addresses.WETH, addresses.WBTC, addresses.USDC],
    poolMeta: 'HLP Staking',
    url: 'https://hmx.org/arbitrum/earn',
  };

  const hlpStakingPoolBlast = {
    pool: `${addresses.HLP_STAKING_BLAST}-blast`,
    chain: 'Blast',
    project: 'hmx',
    symbol: 'ETH-USDB',
    tvlUsd: tvlUsdHlpBlast.toNumber(),
    apyBase: blastHlpAprBase().toNumber(),
    apyReward: blastHlpAprReward().toNumber(),
    rewardTokens: [addresses.USDB_BLAST, addresses.ESHMX_BLAST],
    underlyingTokens: [addresses.WETH_BLAST, addresses.USDB_BLAST],
    poolMeta: 'HLP Staking blast',
    url: 'https://hmx.org/blast/earn',
  };

  // //                                 ---------------- HMX ----------------
  const tvlUsdHmx = BigNumber(hmxBalanceInPool)
    .multipliedBy(pricesBySymbol.hmx)
    .dividedBy(WeiPerEther);
  const hmxStakingPool = {
    pool: `${addresses.HMX_STAKING}-arbitrum`,
    chain: 'Arbitrum',
    project: 'hmx',
    symbol: 'HMX-esHMX',
    tvlUsd: tvlUsdHmx.toNumber(),
    apyBase: arbHmxAprBase().toNumber(),
    apyReward: arbHmxAprReward().toNumber(),
    rewardTokens: [addresses.USDC, addresses.ESHMX],
    underlyingTokens: [addresses.ESHMX, addresses.HMX],
    poolMeta: 'HMX Staking - esHMX reward is 1 year linear vested',
    url: 'https://hmx.org/arbitrum/earn',
  };

  return [hlpStakingPoolArb, hlpStakingPoolBlast, hmxStakingPool];
};

module.exports = {
  timetravel: false,
  apy: apy,
};
