const axios = require('axios');

const utils = require('../utils');

const getPools = async () => {
  const vToken = await utils.getData(
    'https://api.bifrost.app/api/site'
  );

  const dotUsd = (
    await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=polkadot&vs_currencies=usd'
    )
  ).data.polkadot.usd;


  const ksmUsd = (
    await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=kusama&vs_currencies=usd'
    )
  ).data.kusama.usd;

  const bncUsd = (
    await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=bifrost&vs_currencies=usd'
    )
  ).data.bifrost.usd;

  const glmrUsd = (
    await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=moonbeam&vs_currencies=usd'
    )
  ).data.moonbeam.usd;

  const movrUsd = (
    await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=moonriver&vs_currencies=usd'
    )
  ).data.moonriver.usd;

  const vDOT = {
    pool: 'polkadot-vdot',
    chain: 'Polkadot',
    project: 'bifrost-finance',
    symbol: 'vDOT',
    tvlUsd: vToken.vDOT.tvm * dotUsd,
    apyBase: Number(vToken.vDOT.apy),
  };

  const vGLMR = {
    pool: 'moonbeam-vglmr',
    chain: 'Moonbeam',
    project: 'bifrost-finance',
    symbol: 'vGLMR',
    tvlUsd: vToken.vGLMR.tvm * glmrUsd,
    apyBase: Number(vToken.vGLMR.apy),
  };

  const vMOVR = {
    pool: 'moonriver-vmovr',
    chain: 'Moonriver',
    project: 'bifrost-finance',
    symbol: 'vMOVR',
    tvlUsd: vToken.vMOVR.tvm * movrUsd,
    apyBase: Number(vToken.vMOVR.apy),
  };

  const vBNC = {
    pool: 'bifrost-vbnc',
    chain: 'Bifrost',
    project: 'bifrost-finance',
    symbol: 'vBNC',
    tvlUsd: vToken.vBNC.tvm * bncUsd,
    apyBase: Number(vToken.vBNC.apy),
  };

  const vKSM = {
    pool: 'kusama-vksm',
    chain: 'Kusama',
    project: 'bifrost-finance',
    symbol: 'vKSM',
    tvlUsd: vToken.vKSM.tvm * ksmUsd,
    apyBase: Number(vToken.vKSM.apy),
  };



  return [vDOT, vGLMR, vMOVR, vKSM, vBNC];
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://bifrost.app/vstaking',
};
