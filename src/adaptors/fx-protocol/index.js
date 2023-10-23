const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const CommonAbi = require('./abis/Common.json');
const reBalanceAbi = require('./abis/reBalance.json');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/';

const fx_reBalancePool = '0xa677d95B91530d56791FbA72C01a862f1B01A49e';
const fx_stETHTreasury = '0x0e5CAA5c889Bdf053c9A76395f62267E653AFbb0';
const wstETH = '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0';
const yearSecond = 31536000;
const cBN = (val) => new BigNumber(val);
const getTvlAndApy = async () => {
  let _tvl = 0;
  let _apy = 0;
  try {
    const rebalancesData = (
      await sdk.api.abi.call({
        target: fx_reBalancePool,
        abi: CommonAbi.totalSupply,
      })
    ).output;
    const getCurrentNav = (
      await sdk.api.abi.call({
        target: fx_stETHTreasury,
        abi: CommonAbi.getCurrentNav,
      })
    ).output;
    const rebalancesRewardData = (
      await sdk.api.abi.call({
        target: fx_reBalancePool,
        params: wstETH,
        abi: reBalanceAbi.extraRewardState,
      })
    ).output;
    const _stETHRate = (
      await sdk.api.abi.call({
        target: wstETH,
        abi: CommonAbi.tokensPerStEth,
      })
    ).output;
    const stETHRate = cBN(1e18).div(_stETHRate).toFixed(4);
    const { _baseNav, _fNav, _xNav } = getCurrentNav;
    _tvl = cBN(rebalancesData).div(1e18).times(_fNav).div(1e18).toFixed(0);

    const { finishAt, rate } = rebalancesRewardData || {};

    const _currentTime = Math.ceil(new Date().getTime() / 1000);
    if (_currentTime > finishAt) {
      _apy = 0;
    } else {
      const apyWei = cBN(rate)
        .div(1e18)
        .multipliedBy(yearSecond)
        .multipliedBy(_baseNav)
        .div(1e18)
        .multipliedBy(stETHRate)
        .div(_tvl)
        .times(100);
      _apy = apyWei.multipliedBy(1.04).toFixed(2);
    }

    return {
      address: fx_reBalancePool,
      tvl: _tvl,
      apy: _apy,
    };
  } catch (error) {
    console.log(error);
    return false;
  }
};

const getPoolData = async () => {
  let poolData = await getTvlAndApy();
  const { address: rebalancePool, tvl, apy } = poolData;
  const newObj = [
    {
      pool: `${rebalancePool}-f(x)`,
      chain: utils.formatChain('ethereum'),
      project: 'fx-protocol',
      symbol: 'fETH',
      tvlUsd: parseInt(tvl, 10),
      apy: parseFloat(apy),
    },
  ];
  return newObj;
};

const main = async () => {
  const data = await getPoolData();
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://fx.aladdin.club/rebalance-pool/',
};
