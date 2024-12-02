const sdk = require('@defillama/sdk');
const utils = require('../utils');

const abiAAVEPolygon = require('./abiAAVEPolygon.json');
const abiAAVEAvalanche = require('./abiAAVEAvalanche.json');
const abiCompoundV3Base = require('./abiCompoundV3Base.json');
const abiMakerDAO = require('./abiMakerDAO.json');
const abiConvex = require('./abiConvex.json');
const abiBenqi = require('./abiBenqiAvalanche.json');
const abiCurveDex = require('./abiCurveDEX.json');
const abiLido = require('./abiLido.json');
const abiAerodromeBase = require('./abiAerodromeBase.json');

const getPoolData = async ({ contract, abi, chain, exchangeRate = 1 }) => {
  const { output: tvlUsd } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'totalAssets'),
    chain,
  });
  
  const { output: decimals } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'decimals'),
    chain,
  });

  const poolsData = await utils.getData(
    'https://api.return.finance//api/our-pools'
  );

  const currentPool = poolsData.pools.find((pool) => {
    const incomingChainParam = chain === 'avax' ? 'avalanche' : chain;

    return (
      pool.networkName.toLowerCase() === incomingChainParam &&
      pool.returnContractAddress.toLowerCase() === contract.toLowerCase()
    );
  });

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: currentPool?.poolPair,
    tvlUsd: (tvlUsd / Math.pow(10, decimals)) * exchangeRate,
    apyBase: currentPool?.apy,
  };
};

const getApy = async () => {
  const ethExchangeRates = await utils.getData(
    'https://api.coinbase.com/v2/exchange-rates?currency=ETH'
  );

  const ethUsdExchangeRate = ethExchangeRates.data.rates.USDC;

  const aavePolygon = await getPoolData({
    contract: '0x0271a46c049293448c2d4794bcd51f953bf742e8',
    abi: abiAAVEPolygon,
    chain: 'polygon',
  });

  const aaveAvalanche = await getPoolData({
    contract: '0x0271A46c049293448C2d4794bCD51f953Bf742e8',
    abi: abiAAVEAvalanche,
    chain: 'avax',
  });

  const compoundV3Base = await getPoolData({
    contract: '0xd99d6D4EA1CDa97cC8eaE2A21007C47D3ae54d5F',
    abi: abiCompoundV3Base,
    chain: 'base',
  });

  const benqi = await getPoolData({
    contract: '0x3A3dAdbca3ec5a815431f45eca33EF1520388Ef2',
    abi: abiBenqi,
    chain: 'avax',
  });

  const makerDao = await getPoolData({
    contract: '0xD8785CDae9Ec24b8796c45E3a2D0F7b03194F826',
    abi: abiMakerDAO,
    chain: 'ethereum',
  });

  const convexFinance = await getPoolData({
    contract: '0xe5c26497D9492AD2328DFEE7dcA240e55cff1779',
    abi: abiConvex,
    chain: 'ethereum',
  });

  const curveDEX = await getPoolData({
    contract: '0xc2d4d9070236bA4ffefd7cf565eb98d11bFeB8E1',
    abi: abiCurveDex,
    chain: 'ethereum',
  });

  const lido = await getPoolData({
    contract: '0x2C2f0FFbFA1B8b9C85400f1726e1bc0892e63D9F',
    abi: abiLido,
    chain: 'ethereum',
    exchangeRate: Number(ethUsdExchangeRate),
  });

  const aerodromeBase = await getPoolData({
    contract: '0x4d95d8A4705Ca23D6679F6E2974b37CC0e89f632',
    abi: abiAerodromeBase,
    chain: 'base',
  });

  return [
    aavePolygon,
    aaveAvalanche,
    compoundV3Base,
    benqi,
    makerDao,
    convexFinance,
    curveDEX,
    lido,
    aerodromeBase,
  ].filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://return.finance',
};
