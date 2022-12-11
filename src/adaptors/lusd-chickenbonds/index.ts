const superagent = require('superagent');
const abi = require('./abi');
const { getRebondApy, contractCall, getLusdUsdPrice } = require('./helpers');
const {
  CHICKEN_BOND_MANAGER_ADDRESS,
  BLUSD_LUSD_3CRV_POOL_ADDRESS,
  LUSD_ADDRESS,
  BLUSD_ADDRESS,
  LUSD_3CRV_POOL_ADDRESS,
  CRV_ADDRESS,
} = require('./addresses');
import type {
  PartialCurvePoolData,
  PartialCurvePoolDetails,
  ChickenBondsStrategy,
  ChickenBondsStrategies,
} from './types';

const getBLusdRebondStrategy = async (): Promise<ChickenBondsStrategy> => {
  const lusdUsdPrice = await getLusdUsdPrice();

  const tvlUsd =
    ((await contractCall(
      CHICKEN_BOND_MANAGER_ADDRESS,
      abi.chickenBondManager.getPendingLUSD
    )) /
      1e18) *
    lusdUsdPrice;

  const rebondApy = await getRebondApy();

  return {
    pool: CHICKEN_BOND_MANAGER_ADDRESS,
    project: 'lusd-chickenbonds',
    symbol: 'bLUSD',
    chain: 'ethereum',
    tvlUsd,
    apyBase: rebondApy,
    underlyingTokens: [LUSD_ADDRESS, BLUSD_ADDRESS],
    rewardTokens: [LUSD_ADDRESS],
  };
};

const getBLusdLusd3CrvStrategy = async (): Promise<ChickenBondsStrategy> => {
  const curvePoolDataResponse = (
    await superagent.get(
      'https://api.curve.fi/api/getPools/ethereum/factory-crypto'
    )
  ).body as PartialCurvePoolData;

  const curvePoolDetailsResponse = (
    await superagent.get(
      'https://api.curve.fi/api/getFactoryAPYs?version=crypto'
    )
  ).body as PartialCurvePoolDetails;

  const poolData = curvePoolDataResponse.data?.poolData.find(
    (pool) => pool.id === 'factory-crypto-134'
  );

  const apyReward = poolData?.gaugeRewards.reduce(
    (total, current) => total + current.apy,
    0
  );

  const apyBase = curvePoolDetailsResponse?.data?.poolDetails?.find(
    (pool) => pool.poolAddress === BLUSD_LUSD_3CRV_POOL_ADDRESS
  )?.apy;

  const tvlUsd = poolData?.usdTotal;

  return {
    pool: BLUSD_LUSD_3CRV_POOL_ADDRESS,
    project: 'lusd-chickenbonds',
    symbol: 'bLUSD/LUSD-3CRV',
    chain: 'ethereum',
    tvlUsd,
    apyBase,
    apyReward,
    underlyingTokens: [LUSD_ADDRESS, BLUSD_ADDRESS, LUSD_3CRV_POOL_ADDRESS],
    rewardTokens: [BLUSD_ADDRESS, LUSD_3CRV_POOL_ADDRESS, LUSD_ADDRESS, CRV_ADDRESS],
  };
};

const getStrategies = async (): Promise<ChickenBondsStrategies> => {
  const bLusdRebondStrategy = await getBLusdRebondStrategy();
  const bLusdLusd3CrvPoolStrategy = await getBLusdLusd3CrvStrategy();

  return [bLusdRebondStrategy, bLusdLusd3CrvPoolStrategy];
};

module.exports = {
  timetravel: false,
  apy: getStrategies,
  url: 'https://chickenbonds.org/',
};
