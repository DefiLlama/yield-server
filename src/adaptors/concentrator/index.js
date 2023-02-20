const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const AladdinConvexVaultABI = require('./abis/AladdinConvexVault.json');
const AladdinCRVABI = require('./abis/AladdinCRV.json');
const curvePools = require('./pools.js');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/'

const concentratorVault = '0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8';
const concentratorNewVault = '0x3Cf54F3A1969be9916DAD548f3C084331C4450b5';
const concentratorAcrv = '0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884';

function createIncrementArray(length) {
  const arr = [];
  for (let i = 0; i < length; i++) arr.push(i);
  return arr;
}

const getAllPools = async () => {
  let vaultsInfo = await utils.getData(`${ALADDIN_API_BASE_URL}api/getVaultsTvl`);
  let pools = []
  if (vaultsInfo.data) {
    const { newVault: newVaultData, oldVault: oldVaultData, aFXSVault: aFXSVaultData, afrxETHVault: afrxETHVaultData } = vaultsInfo.data
    for (let key in newVaultData) {
      let _address = key;
      let _tvl = parseInt(newVaultData[_address].tvl) + parseInt(oldVaultData[_address]?.tvl || 0) + parseInt(aFXSVaultData[_address]?.tvl || 0) + parseInt(afrxETHVaultData[_address]?.tvl || 0);
      let _apy = Math.max(newVaultData[_address].apy.proApy, newVaultData[_address].apy.cureentApy)
      const _data = {
        tvl: _tvl,
        apy: _apy,
        symbol: newVaultData[_address].symbol,
        lpToken: _address
      }
      pools.push(_data)
    }
  }
  return pools;
};

const getAcrvInfo = async () => {
  let crvPrice = await utils.getData(
    'https://api.aladdin.club/api/coingecko/price?ids=convex-crv&vs_currencies=usd'
  );
  crvPrice = crvPrice.data['convex-crv'].usd;
  const acrvTotalUnderlying = (
    await sdk.api.abi.call({
      target: concentratorAcrv,
      abi: AladdinCRVABI.totalUnderlying,
      params: [],
    })
  ).output;

  const acrvTotalSupply = (
    await sdk.api.abi.call({
      target: concentratorAcrv,
      abi: AladdinCRVABI.totalSupply,
      params: [],
    })
  ).output;

  const rate =
    acrvTotalSupply * 1
      ? BigNumber(acrvTotalUnderlying).div(acrvTotalSupply)
      : 1;
  const cvxcrvBalance = BigNumber(acrvTotalUnderlying)
    .multipliedBy(rate)
    .times(crvPrice)
    .div(10 ** 18)
    .toString(10);

  const acrvPrice = BigNumber(crvPrice).times(rate);
  return {
    cvxcrvBalance,
    acrvPrice,
    rate,
  };
};

const getAcrvPoolData = async () => {
  let dataApy = await utils.getData(
    `https://api.aladdin.club/api/convex`
  );
  const acrvInfo = await getAcrvInfo()
  const convexApy = getConvexInfo('CRV', dataApy)?.apy?.project || 0;

  const apy = BigNumber(parseFloat(convexApy))
    .dividedBy(100)
    .dividedBy(365)
    .plus(1)
    .pow(365)
    .minus(1)
    .shiftedBy(2);

  const newObj = {
    pool: `${concentratorAcrv}-concentrator`,
    chain: utils.formatChain('ethereum'),
    project: 'concentrator',
    symbol: 'aCRV',
    tvlUsd: parseInt(acrvInfo.cvxcrvBalance, 10),
    apy: parseFloat(apy.toString(10)),
  };
  return newObj;
};
const getConvexInfo = (tokenName, dataApy) => {
  let data = dataApy;
  try {
    const info =
      data.find(
        (item) =>
          item.name.toLocaleLowerCase() === tokenName.toLocaleLowerCase() ||
          item.name === tokenName
      ) || converWebsiteInfo.find((item) => item.name === tokenName);

    if (BigNumber(parseFloat(info.apy.current)).isNaN()) {
      return converWebsiteInfo.find(
        (item) => item.name === tokenName.toLocaleLowerCase()
      );
    }
    return info;
  } catch (error) {
    return null;
  }
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
  const acrvData = await getAcrvPoolData();
  const data = dataInfo.map((el) => buildPool(el, 'ethereum'));
  data.push(acrvData);
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://concentrator.aladdin.club/#/vault',
};
