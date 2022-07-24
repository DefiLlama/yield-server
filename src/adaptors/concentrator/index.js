const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const AladdinConvexVaultABI = require('./abis/AladdinConvexVault.json');
const AladdinCRVABI = require('./abis/AladdinCRV.json');
const curvePools = require('./pools.js');

const ALADDIN_API_BASE_URL = 'http://concentrator-api.aladdin.club/'

const concentratorVault = '0xc8fF37F7d057dF1BB9Ad681b53Fa4726f268E0e8';
const concentratorNewVault = '0x3Cf54F3A1969be9916DAD548f3C084331C4450b5';
const concentratorAcrv = '0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884';

function createIncrementArray(length) {
  const arr = []
  for (let i = 0; i < length; i++)
    arr.push(i)
  return arr
}

const getAllPools = async () => {
  let dataApy = await utils.getData(`${ALADDIN_API_BASE_URL}apy`);
  let vaultsTvls = await utils.getData(`${ALADDIN_API_BASE_URL}data/vaults/tvl`);
  let vaultsApys = await utils.getData(`${ALADDIN_API_BASE_URL}data/vaults/apy`);

  // const oldPoolLength = (
  //   await sdk.api.abi.call({
  //     target: concentratorVault,
  //     abi: abi.poolLength,
  //   })
  // ).output;

  const poolLength = (
    await sdk.api.abi.call({
      target: concentratorNewVault,
      abi: abi.poolLength,
    })
  ).output;
  const _target = concentratorNewVault;
  const paramsCalls = createIncrementArray(poolLength).map(i => ({ params: i }))
  const { output: poolInfos } = await sdk.api.abi.multiCall({
    target: _target,
    abi: AladdinConvexVaultABI.poolInfo,
    calls: paramsCalls,
  })

  return await Promise.all(poolInfos.map(async (_, i) => {
    const poolInfo = poolInfos[i]
    const poolData = curvePools.find(
      (crvPool) =>
        crvPool.addresses.lpToken.toLowerCase() ===
        poolInfo.output.lpToken.toLowerCase()
    );
    if (!poolData) {
      return {
        lpTvl: 0,
        lpApy: 0,
        poolData: null,
      };
    }
    try {
      let lpTvl = vaultsTvls.data['newVault'][poolInfo.output.lpToken.toLowerCase()].tvl
      if (vaultsTvls.data['oldVault'][poolInfo.output.lpToken.toLowerCase()]) {
        lpTvl = BigNumber(lpTvl).plus(vaultsTvls.data['oldVault'][poolInfo.output.lpToken.toLowerCase()].tvl).toString(10)
      }
      const { apy: lpApy } = vaultsApys.data['newVault'].find(item => item.lpToken.toLowerCase() == poolData.addresses.lpToken.toLowerCase())
      return {
        lpTvl: lpTvl,
        lpApy: lpApy,
        poolData
      };
    } catch (e) {
      console.log('e----', e)
    }
  })
  );
};

const getAcrvInfo = async () => {
  let crvPrice = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=convex-crv&vs_currencies=usd'
  );
  crvPrice = crvPrice['convex-crv'].usd;
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

  const acrvPrice = BigNumber(crvPrice).times(rate)
  return {
    cvxcrvBalance,
    acrvPrice,
    rate
  }
}

const getAcrvPoolData = async () => {
  let dataApy = await utils.getData(
    'http://concentrator-api.aladdin.club/apy/'
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
          item.name.toLocaleLowerCase() === tokenName.toLocaleLowerCase() || item.name === tokenName
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
    pool: `${entry.poolData.addresses.lpToken}-concentrator`,
    chain: utils.formatChain(chainString),
    project: 'concentrator',
    symbol: utils.formatSymbol(entry.poolData.symbol),
    tvlUsd: parseInt(entry.lpTvl, 10),
    apy: parseFloat(entry.lpApy),
  };
  return newObj;
};

const main = async () => {
  const dataInfo = await getAllPools();
  const acrvData = await getAcrvPoolData();
  let _data = []
  dataInfo.map(item => {
    if (item.poolData) {
      _data.push(item)
    }
  })
  const data = _data.map((el) => buildPool(el, 'ethereum'));
  data.push(acrvData);
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
