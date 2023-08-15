const utils = require('../utils');
const axios = require('axios');
const ethers = require('ethers');
const abi = require("./abi");
const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const GHO = '0x40D16FC0246aD3160Ccc09B8D0D3A2cD28aE6C2f'
const GHO_PROVIDER_UI = '0x379c1EDD1A41218bdbFf960a9d5AD2818Bf61aE8'
const POD_MANAGER = '0xf3dEcC68c4FF828456696287B12e5AC0fa62fE56'
const DISCOUNT_CALCULATOR_MODULE ='0x4C38Ec4D1D2068540DfC11DFa4de41F733DDF812'
const RAY = ethers.BigNumber.from(10).pow(27);
const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
const FEE_TO_PERCENT = 1000;

const getPrices = async (address) => {
  const token = `ethereum:${address.toLowerCase()}`
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${token}`
    )
  ).body.coins[token].price;

  return prices;
}

function binomialApproximatedRayPow(
  base,
  exp,
) {
  if (exp.eq(0)) return RAY;

  const expMinusOne = exp.sub(1);
  const expMinusTwo = exp.gt(2) ? exp.sub(2) : 0;

  const basePowerTwo = base.mul(base).div(RAY);
  const basePowerThree = basePowerTwo.mul(base).div(RAY);

  const firstTerm = exp.mul(base);
  const secondTerm = exp
    .mul(expMinusOne)
    .mul(basePowerTwo)
    .div(2);
  const thirdTerm = exp
    .mul(expMinusOne)
    .mul(expMinusTwo)
    .mul(basePowerThree)
    .div(6);

  return RAY.add(firstTerm).add(secondTerm).add(thirdTerm);
}

const getGhoApyDiscounted = (baseApy, ghoDiscount) => {
  const maxGhoDiscount = 10000;
  const apyDiscounted = baseApy.mul(ghoDiscount).div(maxGhoDiscount);
  const apyAfterDiscount = baseApy.sub(apyDiscounted);
  return apyAfterDiscount;
};

const minApy = async () => {
      const assets = (await sdk.api.abi.call({
        target: GHO_PROVIDER_UI,
        abi: abi['getGhoReserveData'],
        chain: 'ethereum',
    })).output;

      const { ghoBaseVariableBorrowRate } = assets;
      const ratePerSecond = ethers.BigNumber.from(ghoBaseVariableBorrowRate).div(SECONDS_PER_YEAR);

      const interestEstimate = binomialApproximatedRayPow(
        ratePerSecond,
        ethers.BigNumber.from(SECONDS_PER_YEAR),
      );
      const currentApy = interestEstimate.sub(RAY).mul(100);
      return currentApy;
}

const maxApy = async () => {
    let discountRate = (await sdk.api.abi.call({
        target: DISCOUNT_CALCULATOR_MODULE,
        abi: abi['calculateDiscountRate'],
        chain: 'ethereum',
        params: [ethers.utils.parseEther('50'),ethers.utils.parseEther('100000')]
    })).output;
    const fee = (await sdk.api.abi.call({
        target: POD_MANAGER,
        abi: abi['mintFeeRatio'],
        chain: 'ethereum',
    })).output;
    const dullahanFeesSim = ethers.utils.parseEther('.00001').mul(fee).div(FEE_TO_PERCENT);
    const dullahanApr = dullahanFeesSim.mul(RAY).div(ethers.utils.parseEther('100'));

    const baseApy = await minApy();
  const apyAfterDiscount = getGhoApyDiscounted(baseApy, discountRate);
  const apyMax = apyAfterDiscount.add(dullahanApr);
  return apyMax.div(ethers.BigNumber.from("10000000000000000000000000")).toNumber() / 100;
}

const totalBorrowUsd = async () => {
  const pods = (await sdk.api.abi.call({
    target: POD_MANAGER,
    abi: abi['getAllPods'],
    chain: 'ethereum',
  })).output;

  const podsData = (await sdk.api.abi.multiCall({
    calls: pods.map((p) => ({
      target: POD_MANAGER,
      params: p,
    })),
    abi: abi['pods'],
    chain: 'ethereum',
  })).output

  const totalAmount = podsData.map((e) => e.output.rentedAmount).reduce((p, c) => {
    return (p + c, 0)
  })

  const ghoPrice = await getPrices(GHO);

  return (ethers.BigNumber.from(totalAmount).div("1000000000000000000")).toNumber() * ghoPrice;
}

const getApy = async () => {
    const apyVal = await maxApy();
    const tvl = await totalBorrowUsd();

  const GHO = {
    pool: '0x167c606be99DBf5A8aF61E1983E5B309e8FA2Ae7-ethereum',
    chain: 'ethereum',
    symbol: 'GHO',
    apyBase: 0,
    apyBaseBorrow: apyVal,
    tvlUsd: tvl,
    borrowable: true,
    ltv: 0,
    project: 'paladin-dullahan'
  };

  return [GHO];
};


module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://dullahan.paladin.vote/',
};