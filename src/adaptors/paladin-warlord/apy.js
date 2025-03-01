const axios = require('axios');
const ethers = require('ethers');
const sdk = require('@defillama/sdk');
const { warLockerAbi } = require('./abi/WarLocker');
const { warRedeemerAbi } = require('./abi/WarRedeemer');
const { getTotalPricePerToken, fetchRewardStates } = require('./utils');
const { cvxLockerAbi } = require('./abi/CvxLocker');

const WAR_ADDRESS = '0xa8258deE2a677874a48F5320670A869D74f0cbC1';
const WAR_STAKER_ADDRESS = '0xA86c53AF3aadF20bE5d7a8136ACfdbC4B074758A';
const WAR_CVX_LOCKER_ADDRESS = '0x700d6d24A55512c6AEC08820B49da4e4193105B3';
const WAR_AURA_LOCKER_ADDRESS = '0x7B90e043aaC79AdeA0Dbb0690E3c832757207a3B';
const REDEEMER_ADDRESS = '0x4787Ef084c1d57ED87D58a716d991F8A9CD3828C';
const AURA_ADDRESS = '0xC0c293ce456fF0ED870ADd98a0828Dd4d2903DBF';
const CVX_ADDRESS = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';
const CVX_LOCKER_ADDRESS = '0x72a19342e8F1838460eBFCCEf09F6585e32db86E';
const CVXCRV_ADDRESS = '0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7';
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const PAL_ADDRESS = '0xAB846Fb6C81370327e784Ae7CbB6d6a6af6Ff4BF';

const computeTotalTvl = async (auraLocked, cvxLocked, auraQueued, cvxQueued) => {
  const auraAmount = Number(auraLocked / ethers.BigNumber.from(1e12)) / 1000000;
  const cvxAmount = Number(cvxLocked / ethers.BigNumber.from(1e12)) / 1000000;

  const warlordTVL =
    (await getTotalPricePerToken(auraAmount, AURA_ADDRESS)) +
    (await getTotalPricePerToken(cvxAmount, CVX_ADDRESS));
  return warlordTVL;
}

const computeActiveTvl = async (
  totalWarLocked,
  warSupply,
  auraLocked,
  cvxLocked,
  auraQueued,
  cvxQueued
) => {
  const auraAmount =
    Number(((auraLocked - auraQueued) * totalWarLocked) / (warSupply *  ethers.BigNumber.from(1e15))) /
    1000;
  const cvxAmount =
    Number(((cvxLocked - cvxQueued) * totalWarLocked) / (warSupply *  ethers.BigNumber.from(1e15))) /
    1000;

  const warlordTVL =
    (await getTotalPricePerToken(auraAmount, AURA_ADDRESS)) +
    (await getTotalPricePerToken(cvxAmount, CVX_ADDRESS));
  return warlordTVL;
}

const computeCrvCvxApr = async (rewardData, lockedSupply, cvxLocked, tvl) => {
  const cvxCrvAmount =
    Number(
      (rewardData[2] *  ethers.BigNumber.from(86400) *  ethers.BigNumber.from(365) * cvxLocked) /
        lockedSupply /
         ethers.BigNumber.from(1e14)
    ) / 10000;
  const cvxCrvDollar = await getTotalPricePerToken(cvxCrvAmount, CVXCRV_ADDRESS);
  const cvxCrvApr = cvxCrvDollar / tvl;
  return cvxCrvApr;
}

const computeAuraBalApr = async (totalWarLocked, warSupply, auraLocked, cvxLocked, breakdownResponse) => {
  let amount = 0;
  for (const apr of breakdownResponse.data.data.locker.aprs.breakdown) {
    if (apr.name == "Aura BAL") {
      amount += apr.value;
    }
  }
  return (
    (amount *
      ((Number(auraLocked) / Number(cvxLocked) / 10) *
        (Number(warSupply) / Number(totalWarLocked)))) /
    100
  );
}

const computeWarApr = async (warRates, auraLocked, cvxLocked, auraQueued, cvxQueued, warSupply, tvl) => {
  if (warRates[2] *  ethers.BigNumber.from(1000) <= new Date().valueOf()) return 0;

  const warAmount = warRates[3] *  ethers.BigNumber.from(86400) *  ethers.BigNumber.from(365);

  const cvxAmount =
    Number(((cvxLocked - cvxQueued) * warAmount) / warSupply /  ethers.BigNumber.from(1e14)) / 10000;
  const auraAmount =
    Number(((auraLocked - auraQueued) * warAmount) / warSupply /  ethers.BigNumber.from(1e14)) / 10000;

  const cvxDollar = await getTotalPricePerToken(cvxAmount, CVX_ADDRESS);
  const auraDollar = await getTotalPricePerToken(auraAmount, AURA_ADDRESS);

  const warDollar = cvxDollar + auraDollar;
  const warApr = warDollar / tvl;

  return warApr;
}

const computeWethApr = async (wethRates, tvl) => {
  if (wethRates[2] *  ethers.BigNumber.from(1000) <= new Date().valueOf()) return 0;

  const wethAmount = wethRates[3] *  ethers.BigNumber.from(86400) *  ethers.BigNumber.from(365);

  const wethDollar = await getTotalPricePerToken(
    Number(wethAmount /  ethers.BigNumber.from(1e12)) / 1000000,
    WETH_ADDRESS
  );

  const wethApr = wethDollar / tvl;
  return wethApr;
}

const computePalApr = async (palRates, tvl) => {
  if (palRates[2] *  ethers.BigNumber.from(1000) <= new Date().valueOf()) return 0;

  const palAmount = palRates[3] *  ethers.BigNumber.from(86400) *  ethers.BigNumber.from(365);

  const palDollar = await getTotalPricePerToken(
    Number(palAmount /  ethers.BigNumber.from(1e14)) / 10000,
    PAL_ADDRESS
  );
  const palApr = palDollar / tvl;
  return palApr;
}



const apy = async () => {
  const warRates = await fetchRewardStates(WAR_ADDRESS);
  const wethRates = await fetchRewardStates(WETH_ADDRESS);
  const palRates = await fetchRewardStates(PAL_ADDRESS);
  const { output: rewardData } = await sdk.api.abi.call({
    abi: cvxLockerAbi.find((a) => a.name === 'rewardData'),
    target: CVX_LOCKER_ADDRESS,
    params: [CVXCRV_ADDRESS],
  });
  const { output: lockedSupply } = await sdk.api.abi.call({
    abi: cvxLockerAbi.find((a) => a.name === 'lockedSupply'),
    target: CVX_LOCKER_ADDRESS,
  });
  const {output: totalWarLocked} = await sdk.api.erc20.balanceOf({
      target: WAR_ADDRESS,
      owner: WAR_STAKER_ADDRESS,
  });
  const { output: totalSupply } = await sdk.api.erc20.totalSupply({
      target: WAR_ADDRESS,
  })
  const { output: auraLocked } = await sdk.api.abi.call({
    abi: warLockerAbi[0],
    target: WAR_AURA_LOCKER_ADDRESS,
  });
  const { output: cvxLocked } = await sdk.api.abi.call({
    abi: warLockerAbi[0],
    target: WAR_CVX_LOCKER_ADDRESS,
  });
  const {output: auraQueued} = await sdk.api.abi.call({
    abi: warRedeemerAbi.find((a) => a.name === 'queuedForWithdrawal'),
    target: REDEEMER_ADDRESS,
    params: [AURA_ADDRESS]
  });
  const {output: cvxQueued} = await sdk.api.abi.call({
    abi: warRedeemerAbi.find((a) => a.name === 'queuedForWithdrawal'),
    target: REDEEMER_ADDRESS,
    params: [CVX_ADDRESS]
  });

  const breakdownResponse = await axios.post('https://data.aura.finance/graphql', {
    query:
      '{\n  locker {\n    aprs {\n      breakdown {\n        value,\nname      },\n    }\n  }\n  \n}\n  \n  '
  });

  const totalTvl = await computeTotalTvl(
    auraLocked,
    cvxLocked,
    auraQueued,
    cvxQueued
  );
  const activeTvl = await computeActiveTvl(
     ethers.BigNumber.from(totalWarLocked),
     ethers.BigNumber.from(totalSupply),
    auraLocked,
    cvxLocked,
    auraQueued,
    cvxQueued
  );
  const auraBalApr = await computeAuraBalApr(
     ethers.BigNumber.from(totalWarLocked),
     ethers.BigNumber.from(totalSupply),
    auraLocked,
    cvxLocked,
    breakdownResponse
  );
  const warApr = await computeWarApr(
    warRates,
    auraLocked,
    cvxLocked,
    auraQueued,
    cvxQueued,
     ethers.BigNumber.from(totalSupply),
    activeTvl
  );
  const wethApr = await computeWethApr(wethRates, activeTvl);
  const palApr = await computePalApr(palRates, activeTvl);
  const cvxCrvApr = await computeCrvCvxApr(rewardData, lockedSupply, cvxLocked, activeTvl);

  const totalApr = warApr + wethApr + palApr + cvxCrvApr + auraBalApr;
  return [{
    pool: `warlord-ethereum`,
    project: 'paladin-warlord',
    chain: 'ethereum',
    symbol: 'WAR',
    apyBase: totalApr * 100,
    tvlUsd: totalTvl,
  }];
}

module.exports = apy;