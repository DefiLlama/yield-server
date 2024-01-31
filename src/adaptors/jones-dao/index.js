const sdk = require('@defillama/sdk4');
const utils = require('../utils');

const lockerABI = require('./aura-locker-abi.json');

const aura = '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF';
const auraLocker = '0x3Fa73f1E5d8A792C80F426fc8F84FBF7Ce9bBCAC';
const auraStrategy = '0x7629fc134e5a7feBEf6340438D96881C8D121f2c';
const glp = '0x1aDDD80E6039594eE970E5872D247bf0414C8903';
const glpTracker = '0x13C6Bed5Aa16823Aba5bBA691CAeC63788b19D9d';
const glpStrategy = '0x64ECc55a4F5D61ead9B966bcB59D777593afBd6f';
const usdc = '0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8';
const uvrt = '0xa485a0bc44988B95245D5F20497CCaFF58a73E99';
const uvrtTracker = '0xEB23C7e19DB72F9a728fD64E1CAA459E457cfaca';
const arbitrum = '0x912CE59144191C1204E64559FE8253a0e49E6548';

const SECONDS_PER_YEAR = 31556952;
// 0.97% see https://docs.jonesdao.io/jones-dao/features/incentives
const JUSDC_RETENTION = 0.97 / 100;
const JGLP_RETENTION = 3 / 100;

async function getLeveragedVaultsTvl(token, address) {
  const collateralBalance = await sdk.api.abi.call({
    abi: 'erc20:balanceOf',
    target: token,
    params: [address],
    chain: 'arbitrum',
  });

  const key = `arbitrum:${token}`;
  const priceUsd = await utils
    .getData(`https://coins.llama.fi/prices/current/${key}`)
    .then((res) => res.coins[key].price);

  const tvl = (Number(collateralBalance.output) / 1e18) * priceUsd;

  return tvl;
}

async function pools() {
  const [
    auraLeftoverStrategy,
    auraLocked,
    prices,
    jauraApyRes,
    jusdcApy,
    jglpApy,
    jusdcTvl,
    jglpTvl,
    stipFarms,
  ] = await Promise.all([
    sdk.api.erc20
      .balanceOf({
        target: aura,
        owner: auraStrategy,
      })
      .then((result) => result.output),
    sdk.api.abi
      .call({
        abi: lockerABI.at(0),
        target: auraLocker,
        params: auraStrategy,
      })
      .then((result) => result.output[0]),
    utils.getPrices([`ethereum:${aura}`, `arbitrum:${arbitrum}`]),
    utils.getData('https://api.jonesdao.io/api/v1/jones/apy-wjaura'),
    utils
      .getData('https://api.jonesdao.io/api/v1/jones/apy-jusdc')
      .then((res) => res.jusdcApy),
    utils
      .getData('https://api.jonesdao.io/api/v1/jones/apy-jglp')
      .then((res) => res.jglpApy),
    getLeveragedVaultsTvl(uvrt, uvrtTracker),
    getLeveragedVaultsTvl(glp, glpStrategy),
    utils
      .getData('https://app.jonesdao.io/api/stip-farms')
      .then((res) => res.farms),
  ]);

  const { aura: auraPrice, arb: arbPrice } = prices.pricesBySymbol;

  const jAuraTvl =
    (Number(auraLocked) / 1e18 + Number(auraLeftoverStrategy) / 1e18) *
    auraPrice;

  const jAuraPool = {
    pool: `${auraStrategy}-arbitrum`.toLowerCase(),
    chain: 'Ethereum',
    project: 'jones-dao',
    symbol: 'jAURA',
    underlyingTokens: [aura],
    tvlUsd: jAuraTvl,
    apyBase: jauraApyRes.jauraApy * (1 - JGLP_RETENTION),
    apyBaseInception: jauraApyRes.jauraApyInception,
    apyReward: stipFarms[2].apr,
  };

  const jUsdcPool = {
    pool: `${uvrtTracker}-arbitrum`.toLowerCase(),
    chain: 'Arbitrum',
    project: 'jones-dao',
    symbol: 'jUSDC',
    underlyingTokens: [usdc],
    tvlUsd: jusdcTvl,
    apyBase: jusdcApy.week * (1 - JUSDC_RETENTION),
    apyBaseInception: jusdcApy.full,
    poolMeta: '1day lock',
    apyReward: stipFarms[1].apr,
  };

  const jGlpPool = {
    pool: `${glpTracker}-arbitrum`.toLowerCase(),
    chain: 'Arbitrum',
    project: 'jones-dao',
    symbol: 'jGLP',
    underlyingTokens: [glp],
    tvlUsd: jglpTvl,
    apyBase: jglpApy.week * (1 - JGLP_RETENTION),
    apyBaseInception: jglpApy.full,
    apyReward: stipFarms[0].apr,
  };

  return [jUsdcPool, jGlpPool, jAuraPool];
}

module.exports = {
  timetravel: false,
  url: 'https://app.jonesdao.io/vaults',
  apy: pools,
};
