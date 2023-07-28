const { getProvider } = require('@defillama/sdk/build/general');
const { ethers, Contract, BigNumber } = require('ethers');
const nusdcABI = require('./abis/nUSDC.json');
const snusdcABI = require('./abis/snUSDC.json');
const poolABI = require('./abis/camelotPool.json');
const strategyVaultABI = require('./abis/strategyVault.json');

const nUSDCAddress = '0x2a958665bC9A1680135241133569C7014230Cb21';
const snUSDCAddress = '0x1B872bb0080159F9BDb77E5b1B006c6cb70D718a';
const xGrailAddress = '0x3CAaE25Ee616f2C8E13C74dA0813402eae3F496b';
const grailUSDCAddress = '0x87425D8812f44726091831a9A109f4bDc3eA34b4';
const esNeuUSDCAddress = '0x4E94703760323534A0Ed949ae4d21De17b90e0Bb';
const strategyVaultAddress = '0x6Bfa4F1DfAfeb9c37E4E8d436E1d0C5973E47e25';
const esNeuAddress = '0x22F4730e21e40Dc751c08826d93010A64185e53f';

const USDC_DECIMAL = 6;
const NEUTRA_BASE_DECIMAL = 18;
const SECONDS_PER_YEAR = 31536000;

const rpcUrl = 'https://rpc.ankr.com/arbitrum';

const simpleRpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);

exports.getApy = async function () {
  const nusdcContract = new Contract(nUSDCAddress, nusdcABI, simpleRpcProvider);
  const snusdcContract = new Contract(
    snUSDCAddress,
    snusdcABI.abi,
    simpleRpcProvider
  );
  const grailUSDCPoolContract = new Contract(
    grailUSDCAddress,
    poolABI,
    simpleRpcProvider
  );

  const esNeuUsdcPoolContract = new Contract(
    esNeuUSDCAddress,
    poolABI,
    simpleRpcProvider
  );

  let xGrailReserves = await grailUSDCPoolContract.getReserves();
  const xGrailPrice = xGrailReserves[1] / xGrailReserves[0];

  let esNeuReserves = await esNeuUsdcPoolContract.getReserves();
  let esNeuPrice = esNeuReserves[1] / esNeuReserves[0];

  const snUsdcTotalSupply = await nusdcContract.totalSupply();
  const nUsdcPrice = await nusdcContract.pricePerShare();
  const totalValueLocked = snUsdcTotalSupply
    .mul(nUsdcPrice)
    .div(expandDecimals(1, USDC_DECIMAL));
  const totalValueLocedInUsd = Number(totalValueLocked);

  const xGrailPerInterval = await snusdcContract.tokensPerInterval(
    xGrailAddress
  );

  const grailPrice =
    xGrailPrice * expandDecimals(1, NEUTRA_BASE_DECIMAL - USDC_DECIMAL); // 18
  const xGrailAnnualReward =
    ((xGrailPerInterval * SECONDS_PER_YEAR * grailPrice) /
      expandDecimals(1, NEUTRA_BASE_DECIMAL)) *
    expandDecimals(1, 12);
  const xGrailAnnualRewardUsd = Number(xGrailAnnualReward);
  const parsedxGrailApr =
    xGrailAnnualRewardUsd === 0
      ? 0
      : (xGrailAnnualRewardUsd / totalValueLocedInUsd) * 100;

  const esNeuPerInterval = await snusdcContract.tokensPerInterval(esNeuAddress);
  const esNeuAnnualReward =
    ((esNeuPerInterval * SECONDS_PER_YEAR * esNeuPrice) / totalValueLocked) *
    100;

  const xGrailApy = parsedxGrailApr / 1e6;
  return xGrailApy + esNeuAnnualReward;
};

exports.getTvl = async function () {
  const strategyVaultContract = new Contract(
    strategyVaultAddress,
    strategyVaultABI.abi,
    simpleRpcProvider
  );

  const nusdcContract = new Contract(nUSDCAddress, nusdcABI, simpleRpcProvider);

  const nusdcTvl = (await nusdcContract.totalAssets()) / 1e6;
  const nglpTvl = (await strategyVaultContract.totalValue()) / 1e30;

  return [nusdcTvl, nglpTvl];
};

function bigNumberify(n) {
  try {
    return BigNumber.from(n);
  } catch (e) {
    console.error('bigNumberify error', e);
    return BigNumber.from('0');
  }
}

function expandDecimals(n, decimals) {
  return bigNumberify(n).mul(bigNumberify(10).pow(decimals));
}
