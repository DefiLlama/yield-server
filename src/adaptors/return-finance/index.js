const sdk = require('@defillama/sdk');

const abiAAVEPolygon = require('./abiAAVEPolygon.json');
const abiAAVEAvalanche = require('./abiAAVEAvalanche.json');
const abiCompoundV3Base = require('./abiCompoundV3Base.json');
const abiMakerDAO = require('./abiMakerDAO.json');
const abiConvex = require('./abiConvex.json');

const getAAVEPolygon = async () => {
  const contract = '0x3B6385493a1d4603809dDbaE647200eF8baA53F5';
  const chain = 'polygon';

  const [{ output: tvlUsd }, { output: symbol }] = await Promise.all([
    sdk.api.abi.call({
      target: contract,
      abi: abiAAVEPolygon.find((m) => m.name === 'totalAssets'),
      chain,
    }),
    sdk.api.abi.call({
      target: contract,
      abi: abiAAVEPolygon.find((m) => m.name === 'symbol'),
      chain,
    }),
  ]);

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: symbol,
    tvlUsd: tvlUsd / 1000000,
    apyBase: 10,
  };
};

const getAAVEAvalanche = async () => {
  const contract = '0x3B6385493a1d4603809dDbaE647200eF8baA53F5';
  const chain = 'avax';

  const [{ output: tvlUsd }, { output: symbol }] = await Promise.all([
    sdk.api.abi.call({
      target: contract,
      abi: abiAAVEAvalanche.find((m) => m.name === 'totalAssets'),
      chain,
    }),
    sdk.api.abi.call({
      target: contract,
      abi: abiAAVEAvalanche.find((m) => m.name === 'symbol'),
      chain,
    }),
  ]);

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: symbol,
    tvlUsd: tvlUsd / 1000000,
    apyBase: 10,
  };
};

const getCompoundV3Base = async () => {
  const contract = '0x3B6385493a1d4603809dDbaE647200eF8baA53F5';
  const chain = 'base';

  const [{ output: tvlUsd }, { output: symbol }] = await Promise.all([
    sdk.api.abi.call({
      target: contract,
      abi: abiCompoundV3Base.find((m) => m.name === 'totalAssets'),
      chain,
    }),
    sdk.api.abi.call({
      target: contract,
      abi: abiCompoundV3Base.find((m) => m.name === 'symbol'),
      chain,
    }),
  ]);

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: symbol,
    tvlUsd: tvlUsd / 1000000,
    apyBase: 10,
  };
};

const getMakerDAO = async () => {
  const contract = '0x201254227f9fE57296C257397Be6c617389a8cCb';
  const chain = 'ethereum';

  const [{ output: tvlUsd }, { output: symbol }] = await Promise.all([
    sdk.api.abi.call({
      target: contract,
      abi: abiMakerDAO.find((m) => m.name === 'totalAssets'),
      chain,
    }),
    sdk.api.abi.call({
      target: contract,
      abi: abiMakerDAO.find((m) => m.name === 'symbol'),
      chain,
    }),
  ]);

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: symbol,
    tvlUsd: tvlUsd / 1000000,
    apyBase: 10,
  };
};

const getConvexFinance = async () => {
  const contract = '0xFD360A096E4a4c3C424fc3aCd85da8010D0Db9a5';
  const chain = 'ethereum';

  const [{ output: tvlUsd }, { output: symbol }] = await Promise.all([
    sdk.api.abi.call({
      target: contract,
      abi: abiConvex.find((m) => m.name === 'totalAssets'),
      chain,
    }),
    sdk.api.abi.call({
      target: contract,
      abi: abiConvex.find((m) => m.name === 'symbol'),
      chain,
    }),
  ]);

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: symbol,
    tvlUsd: tvlUsd / 1000000,
    apyBase: 10,
  };
};

const getApy = async () => {
  const aavePolygon = await getAAVEPolygon();
  const aaveAvalanche = await getAAVEAvalanche();
  const compoundV3Base = await getCompoundV3Base();
  // const makerDao = await getMakerDAO();
  // const convexFinance = await getConvexFinance();

  return [
    aavePolygon,
    aaveAvalanche,
    compoundV3Base,
    'makerDao',
    'convexFinance',
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://return.finance',
};
