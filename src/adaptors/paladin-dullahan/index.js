const ethers = require('ethers');
const abi = require('./abi');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');

/////////////////////////// Constants ///////////////////////////

const AAVE_DATA_PROVIDER = '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3';
const STAKER_PROVIDER = '0x5E045cfb738F01bC73CEAFF783F4C16e8B14090b';
const STAKING_CONTRACT = '0x990f58570b4C7b8b7ae3Bc28EFEB2724bE111545';
const DULLAHAN_VAULT = '0x167c606be99DBf5A8aF61E1983E5B309e8FA2Ae7';
const AAVE = '0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9';
const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f';
const GHO_PROVIDER_UI = '0x379c1EDD1A41218bdbFf960a9d5AD2818Bf61aE8';
const POD_MANAGER = '0xf3dEcC68c4FF828456696287B12e5AC0fa62fE56';
const DISCOUNT_CALCULATOR_MODULE = '0x4C38Ec4D1D2068540DfC11DFa4de41F733DDF812';
const RAY = ethers.BigNumber.from(10).pow(27);
const WEI_UNIT = ethers.BigNumber.from(10).pow(18);
const WEI_UNDER = ethers.BigNumber.from(10).pow(16); // 18 - 2 (decimals)
const RAY_UNDER = ethers.BigNumber.from(10).pow(25); // 27 - 2 (decimals)
const FEE_TO_PERCENT = 1000;
const BIG_PERC_TO_WEI = ethers.BigNumber.from(10).pow(14); // 18 - 4(LTV_PREC_DECIMAL)
const LTV_PRECISION = 4;
const LTV_PREC_BIG = 10 ** LTV_PRECISION;
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

/////////////////////////// Global variables ///////////////////////////

let ghoPrice = 0;
let aavePrice = 0;
let defillamaPools = [];
let pods = [];

/////////////////////////// Utils ///////////////////////////

const getAaveApy = async (token) => {
  return defillamaPools.find((pool) => pool.underlyingTokens.includes(token))
    .apy;
};

function binomialApproximatedRayPow(base, exp) {
  if (exp.eq(0)) return RAY;

  const expMinusOne = exp.sub(1);
  const expMinusTwo = exp.gt(2) ? exp.sub(2) : 0;

  const basePowerTwo = base.mul(base).div(RAY);
  const basePowerThree = basePowerTwo.mul(base).div(RAY);

  const firstTerm = exp.mul(base);
  const secondTerm = exp.mul(expMinusOne).mul(basePowerTwo).div(2);
  const thirdTerm = exp
    .mul(expMinusOne)
    .mul(expMinusTwo)
    .mul(basePowerThree)
    .div(6);

  return RAY.add(firstTerm).add(secondTerm).add(thirdTerm);
}

const getPrices = async (address) => {
  const token = `ethereum:${address.toLowerCase()}`;
  const prices = (
    await superagent.get(`https://coins.llama.fi/prices/current/${token}`)
  ).body.coins[token];

  return {
    price: prices.price,
    symbol: prices.symbol,
    decimals: prices.decimals,
  };
};

const getDefiLLamaPools = async (project, chain) => {
  const pools = (await superagent.get('https://yields.llama.fi/pools')).body
    .data;
  return pools.filter(
    (pool) =>
      pool.project === project && pool.chain === chain && pool.underlyingTokens
  );
};

const getPods = async () => {
  const pods = (
    await sdk.api.abi.call({
      target: POD_MANAGER,
      abi: abi['getAllPods'],
      chain: 'ethereum',
    })
  ).output;

  const podsData = (
    await sdk.api.abi.multiCall({
      calls: pods.map((p) => ({
        target: POD_MANAGER,
        params: p,
      })),
      abi: abi['pods'],
      chain: 'ethereum',
    })
  ).output;

  return podsData.map((p) => p.output);
};

/////////////////////////// Vault Apy Computation ///////////////////////////

const stakeBig = async () => {
  const assets = (
    await sdk.api.abi.call({
      target: STAKER_PROVIDER,
      chain: 'ethereum',
      abi: abi['getAllStakedTokenData'],
    })
  ).output;

  const stakeApyBig = ethers.BigNumber.from(assets.stkAaveData.stakeApy);
  const stakeBig = stakeApyBig.mul(BIG_PERC_TO_WEI);

  return stakeBig.div(BIG_PERC_TO_WEI).toNumber() / 100;
};

const bigReward = async () => {
  const rewardState = (
    await sdk.api.abi.call({
      target: STAKING_CONTRACT,
      abi: abi['rewardStates'],
      params: [GHO],
      chain: 'ethereum',
    })
  ).output;
  const indx = ethers.BigNumber.from(
    (
      await sdk.api.abi.call({
        target: STAKING_CONTRACT,
        abi: abi['getCurrentIndex'],
        chain: 'ethereum',
      })
    ).output
  );

  const ratePerSec = rewardState.ratePerSecond;
  const ratePerYear = ethers.BigNumber.from(ratePerSec).mul(SECONDS_PER_YEAR);

  const rewardApy =
    aavePrice !== 0 && indx.gt('0') && ratePerYear.gt(0)
      ? ratePerYear
          .mul(RAY)
          .mul(ghoPrice * LTV_PREC_BIG)
          .div(aavePrice * LTV_PREC_BIG)
          .div(indx)
      : ethers.BigNumber.from('0');
  const rewardPerc = rewardApy.mul(100);

  return rewardPerc.div(RAY_UNDER).toNumber() / 100;
};

/////////////////////////// GHO Borrow Apy Computation ///////////////////////////

const getGhoApyDiscounted = (baseApy, ghoDiscount) => {
  const maxGhoDiscount = 10000;
  const apyDiscounted = baseApy.mul(ghoDiscount).div(maxGhoDiscount);
  const apyAfterDiscount = baseApy.sub(apyDiscounted);
  return apyAfterDiscount;
};

const minApy = async () => {
  const assets = (
    await sdk.api.abi.call({
      target: GHO_PROVIDER_UI,
      abi: abi['getGhoReserveData'],
      chain: 'ethereum',
    })
  ).output;

  const { ghoBaseVariableBorrowRate } = assets;
  const ratePerSecond = ethers.BigNumber.from(ghoBaseVariableBorrowRate).div(
    SECONDS_PER_YEAR
  );

  const interestEstimate = binomialApproximatedRayPow(
    ratePerSecond,
    ethers.BigNumber.from(SECONDS_PER_YEAR)
  );
  const currentApy = interestEstimate.sub(RAY).mul(100);
  return currentApy;
};

const maxApy = async () => {
  let discountRate = (
    await sdk.api.abi.call({
      target: DISCOUNT_CALCULATOR_MODULE,
      abi: abi['calculateDiscountRate'],
      chain: 'ethereum',
      params: [50000000000000000000n, 100000000000000000000000n],
    })
  ).output;
  const fee = (
    await sdk.api.abi.call({
      target: POD_MANAGER,
      abi: abi['mintFeeRatio'],
      chain: 'ethereum',
    })
  ).output;
  const dullahanFeesSim = ethers.utils
    .parseEther('.00001')
    .mul(fee)
    .div(FEE_TO_PERCENT);
  const dullahanApr = dullahanFeesSim
    .mul(RAY)
    .div(ethers.utils.parseEther('100'));

  const baseApy = await minApy();
  const apyAfterDiscount = getGhoApyDiscounted(baseApy, discountRate);
  const apyMax = apyAfterDiscount.add(dullahanApr);
  return apyMax.div(RAY_UNDER).toNumber() / 100;
};

/////////////////////////// Compute TVL ///////////////////////////

const getBorrowTvl = async (token) => {
  let totalAmount = 0;

  for (const pod of pods) {
    if (pod.collateral !== token) continue;
    totalAmount +=
      (ethers.BigNumber.from(pod.rentedAmount).div(WEI_UNDER).toNumber() /
        100) *
      ghoPrice;
  }
  return totalAmount;
};

const getSupplyTvl = async (token) => {
  let totalAmount = 0;

  for (const pod of pods) {
    if (pod.collateral !== token) continue;
    const tokenPrice = await getPrices(token);
    const amount = (
      await sdk.api.abi.call({
        target: pod.podAddress,
        abi: abi['podCollateralBalance'],
        chain: 'ethereum',
      })
    ).output;
    if (tokenPrice.decimals > 2) {
      totalAmount +=
        (ethers.BigNumber.from(amount)
          .div(ethers.BigNumber.from(10).pow(tokenPrice.decimals - 2))
          .toNumber() /
          100) *
        tokenPrice.price;
    } else {
      totalAmount +=
        ethers.BigNumber.from(amount)
          .div(ethers.BigNumber.from(10).pow(tokenPrice.decimals))
          .toNumber() * tokenPrice.price;
    }
  }
  return totalAmount;
};

const getTotalSuppliedTvl = async () => {
  const assets = (
    await sdk.api.abi.call({
      abi: abi['totalAssets'],
      chain: 'ethereum',
      target: DULLAHAN_VAULT,
    })
  ).output;

  return ethers.BigNumber.from(assets).div(WEI_UNIT).toNumber() * aavePrice;
};

const getDebtCeiling = async () => {
  const stkaaaveAvailable = ethers.BigNumber.from(
    (
      await sdk.api.abi.call({
        target: DULLAHAN_VAULT,
        abi: abi['totalAvailable'],
        chain: 'ethereum',
      })
    ).output
  );

  const discount = ethers.BigNumber.from(
    (
      await sdk.api.abi.call({
        target: DISCOUNT_CALCULATOR_MODULE,
        abi: abi['GHO_DISCOUNTED_PER_DISCOUNT_TOKEN'],
        chain: 'ethereum',
      })
    ).output
  );

  return (
    stkaaaveAvailable.mul(discount).div(WEI_UNIT.pow(2)).toNumber() * ghoPrice
  );
};

/////////////////////////// Get the pool ///////////////////////////

const getCollaterals = async () => {
  const reserveTokens = (
    await sdk.api.abi.call({
      target: AAVE_DATA_PROVIDER,
      abi: abi['getAllReservesTokens'],
      chain: 'ethereum',
    })
  ).output;

  const allowed = (
    await sdk.api.abi.multiCall({
      abi: abi['allowedCollaterals'],
      calls: reserveTokens.map((t) => ({
        target: POD_MANAGER,
        params: t.tokenAddress,
      })),
      chain: 'ethereum',
    })
  ).output;

  return reserveTokens.filter(
    (e) => allowed.find((p) => p.input.params[0] == e.tokenAddress).output
  );
};

const getApy = async () => {
  ghoPrice = (await getPrices(GHO)).price;
  aavePrice = (await getPrices(AAVE)).price;
  defillamaPools = await getDefiLLamaPools('aave-v3', 'Ethereum');
  pods = await getPods();

  const apyBaseBorrow = await maxApy();
  const suppliedTvl = await getTotalSuppliedTvl();
  const vaultApyBase = await stakeBig();
  const vaultApyReward = await bigReward();
  const debtCeilingUsd = await getDebtCeiling();

  const collaterals = await getCollaterals();

  const pools = [];
  for (const collateral of collaterals) {
    const totalBorrowUsd = await getBorrowTvl(collateral.tokenAddress);
    const totalSupplyUsd = await getSupplyTvl(collateral.tokenAddress);
    const apyBase = await getAaveApy(collateral.tokenAddress);

    const pool = {
      pool: `${DULLAHAN_VAULT}-${collateral.symbol}-ethereum`,
      project: 'paladin-dullahan',
      chain: 'ethereum',
      symbol: `d${collateral.symbol}`,
      apyBase,
      apyBaseBorrow,
      totalSupplyUsd,
      totalBorrowUsd,
      tvlUsd: totalSupplyUsd,
      mintedCoin: 'GHO',
      debtCeilingUsd,
    };
    pools.push(pool);
  }

  const dstkAAVE = {
    pool: `${DULLAHAN_VAULT}-ethereum`,
    project: 'paladin-dullahan',
    chain: 'ethereum',
    symbol: 'dstkAAVE',
    apyBase: vaultApyBase,
    apyReward: vaultApyReward,
    tvlUsd: suppliedTvl,
  };
  pools.push(dstkAAVE);

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://dullahan.paladin.vote/',
};
