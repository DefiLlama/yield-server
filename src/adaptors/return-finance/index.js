const sdk = require('@defillama/sdk5');
const utils = require('../utils');

const abiAAVEPolygon = require('./abiAAVEPolygon.json');
const abiAAVEAvalanche = require('./abiAAVEAvalanche.json');
const abiCompoundV3Base = require('./abiCompoundV3Base.json');
const abiMakerDAO = require('./abiMakerDAO.json');
const abiConvex = require('./abiConvex.json');

const getPoolData = async ({ contract, abi, chain }) => {
  const { output: tvlUsd } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'totalAssets'),
    chain,
  });

  const poolsData = await utils.getData(
    'https://api.return.finance//api/our-pools'
  );

  const currentPool = poolsData.pools.find((pool) => {
    const incomingChainParam = chain === 'avax' ? 'avalanche' : chain;

    return (
      pool.networkName.toLowerCase() === incomingChainParam &&
      pool.returnContractAddress === contract
    );
  });

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: 'USDC',
    tvlUsd: tvlUsd / 1000000,
    apyBase: currentPool?.apy,
  };
};

const getApy = async () => {
  const aavePolygon = await getPoolData({
    contract: '0x3B6385493a1d4603809dDbaE647200eF8baA53F5',
    abi: abiAAVEPolygon,
    chain: 'polygon',
  });

  const aaveAvalanche = await getPoolData({
    contract: '0x3B6385493a1d4603809dDbaE647200eF8baA53F5',
    abi: abiAAVEAvalanche,
    chain: 'avax',
  });

  const compoundV3Base = await getPoolData({
    contract: '0x3B6385493a1d4603809dDbaE647200eF8baA53F5',
    abi: abiCompoundV3Base,
    chain: 'base',
  });

  const makerDao = await getPoolData({
    contract: '0x201254227f9fE57296C257397Be6c617389a8cCb',
    abi: abiMakerDAO,
    chain: 'ethereum',
  });

  const convexFinance = await getPoolData({
    contract: '0xFD360A096E4a4c3C424fc3aCd85da8010D0Db9a5',
    abi: abiConvex,
    chain: 'ethereum',
  });

  return [
    aavePolygon,
    aaveAvalanche,
    compoundV3Base,
    makerDao,
    convexFinance,
  ].filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://return.finance',
};
