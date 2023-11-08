const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const AladdinConvexVaultABI = require('./abis/AladdinConvexVault.json');
const AladdinCRVABI = require('./abis/AladdinCRV.json');
const curvePools = require('./pools.js');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/';

const concentratorAcrv = '0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884';
const aladdinSdCRV = '0x43E54C2E7b3e294De3A155785F52AB49d87B9922';
const aladdinCVX = '0xb0903Ab70a7467eE5756074b31ac88aEBb8fB777';

const getAllPools = async () => {
  let vaultsInfo = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/concentrator_pool_tvl_apy`
  );
  let pools = [];
  if (vaultsInfo.data) {
    vaultsInfo.data.map((item) => {
      pools.push({
        tvl: item.tvl,
        apy: item.apy.proApy,
        symbol: item.lpName,
        lpToken: item.address,
      });
    });
  }
  return pools;
};

const getATokenData = async () => {
  let aTokenData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/concentrator_aToken_tvl_apy`
  );
  const { aCRV, asdCRV, aladdinCVX } = aTokenData.data;
  const newObj = [
    {
      pool: `${concentratorAcrv}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'aCRV',
      tvlUsd: parseInt(aCRV.tvl, 10),
      apy: parseFloat(aCRV.apy),
    },
    {
      pool: `${aladdinSdCRV}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'asdCRV',
      tvlUsd: parseInt(asdCRV.tvl, 10),
      apy: parseFloat(asdCRV.apy),
    },
    {
      pool: `${aladdinCVX}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'aCVX',
      tvlUsd: parseInt(aladdinCVX.tvl, 10),
      apy: parseFloat(aladdinCVX.apy),
    },
  ];
  return newObj;
};

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: `${entry.lpToken}-concentrator`.toLowerCase(),
    chain: utils.formatChain(chainString),
    project: 'concentrator',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: parseInt(entry.tvl, 10),
    apy: parseFloat(entry.apy),
  };
  return newObj;
};

const main = async () => {
  const dataInfo = await getAllPools();
  const aTokenData = await getATokenData();
  let data = dataInfo.map((el) => buildPool(el, 'ethereum'));
  data = data.concat(aTokenData);
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://concentrator.aladdin.club/#/vault',
};
