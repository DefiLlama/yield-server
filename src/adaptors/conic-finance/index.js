const utils = require('../utils');
const controllerAbi = require('./abis/conic-controller-abi.json');
const poolAbi = require('./abis/conic-pool-abi.json');
const erc20Abi = require('./abis/conic-erc20-abi.json');
const inflationManagerAbi = require('./abis/conic-inflation-manager-abi.json');
const { getProvider } = require('@defillama/sdk/build/general');
const { Contract, BigNumber } = require('ethers');
const provider = getProvider('ethereum');

const BLOCKS_PER_YEAR = 2580032;

const CONTROLLER = '0x2790EC478f150a98F5D96755601a26403DF57EaE';
const INFLATION_MANAGER = '0x05F494E6554fab539873dcF92A4D2F6930105B16';
const CRV = '0xD533a949740bb3306d119CC777fa900bA034cd52';
const CVX = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';
const CNC = '0x9aE380F0272E2162340a5bB646c354271c0F5cFC';

const PRICE_API = 'https://coins.llama.fi/prices/current/ethereum:';
const CURVE_APY_API = 'https://www.convexfinance.com/api/curve-apys';
const CURVE_POOL_API = 'https://api.curve.fi/api/getPools/ethereum/main';

const CURVE_POOL_DATA = {
  // USDC+crvUSD
  '0x4DEcE678ceceb27446b35C672dC7d61F30bAD69E': {
    convexId: 'factory-crvusd-0',
  },
  // USDT+crvUSD
  '0x390f3595bCa2Df7d23783dFd126427CCeb997BF4': {
    convexId: 'factory-crvusd-1',
  },
  // USDP+crvUSD
  '0xCa978A0528116DDA3cbA9ACD3e68bc6191CA53D0': {
    convexId: 'factory-crvusd-2',
  },
  // TUSD+crvUSD
  '0x34D655069F4cAc1547E4C8cA284FfFF5ad4A8db0': {
    convexId: 'factory-crvusd-3',
  },
};

const blockNumber = async () => provider.getBlockNumber();

const contract = (a, abi) => new Contract(a, abi, provider);

const addresses = async () => contract(CONTROLLER, controllerAbi).listPools();

const inflationRate = async () => {
  return contract(
    INFLATION_MANAGER,
    inflationManagerAbi
  ).currentInflationRate();
};

const symbol = async (a) => contract(a, erc20Abi).symbol();

const decimals = async (a) => contract(a, erc20Abi).decimals();

const underlying = async (a) => contract(a, poolAbi).underlying();

const totalUnderlying = async (a) => contract(a, poolAbi).totalUnderlying();

const weights = async (a) => contract(a, poolAbi).getWeights();

const exchangeRate = async (a) => contract(a, poolAbi).exchangeRate();

const bnToNum = (bn, dec = 18) => Number(bn.toString()) / 10 ** dec;

const priceCoin = async (coin) => {
  const data_ = await utils.getData(`${PRICE_API}${coin}`);
  return data_.coins[`ethereum:${coin}`].price;
};

const curveApyData = async () => {
  const data_ = await utils.getData(CURVE_APY_API);
  return data_.apys;
};

const curvePoolData = async () => {
  const data_ = await utils.getData(CURVE_POOL_API);
  return data_.data.poolData;
};

const deployedAtBlock = async (poolAddress) => {
  const poolContract = contract(poolAddress, poolAbi);
  const deposits = await poolContract.queryFilter(
    poolContract.filters.Deposit(null, null)
  );

  // Handle edge cases when the pool is first deployed
  if (deposits.length === 0) return 0;

  return deposits[0].blockNumber;
};

const curvePoolId = (poolData, poolAddress) => {
  const override = CURVE_POOL_DATA[poolAddress];
  if (override) return override.convexId;
  const data = poolData.find((p) => p.address === poolAddress);
  if (!data) return null;
  return data.id;
};

const poolApy = (
  weights_,
  apyData,
  poolData,
  blockNumber_,
  deployedAtBlock_,
  exchangeRate_
) => {
  const scale = BLOCKS_PER_YEAR / (blockNumber_ - deployedAtBlock_);
  let positiveSlippageApr = (bnToNum(exchangeRate_) ** scale - 1) * 100;

  // Handle edge cases when the pool is first deployed
  if (positiveSlippageApr < 0) positiveSlippageApr = 0;

  const base =
    weights_.reduce((total, weight) => {
      const id = curvePoolId(poolData, weight.poolAddress);
      if (!id) return total;
      const apy = apyData[id];
      return apy.baseApy * bnToNum(weight.weight) + total;
    }, 0) + positiveSlippageApr;
  const crv = weights_.reduce((total, weight) => {
    const id = curvePoolId(poolData, weight.poolAddress);
    if (!id) return total;
    const apy = apyData[id];
    return apy.crvApy * bnToNum(weight.weight) + total;
  }, 0);
  return {
    base,
    crv: crv,
  };
};

const pool = async (address, apyData, poolData) => {
  const [underlying_] = await Promise.all([underlying(address)]);
  const [
    symbol_,
    decimals_,
    totalUnderlying_,
    price_,
    weights_,
    exchangeRate_,
    blockNumber_,
    deployedAtBlock_,
  ] = await Promise.all([
    symbol(underlying_),
    decimals(underlying_),
    totalUnderlying(address),
    priceCoin(underlying_),
    weights(address),
    exchangeRate(address),
    blockNumber(),
    deployedAtBlock(address),
  ]);

  const apr = poolApy(
    weights_,
    apyData,
    poolData,
    blockNumber_,
    deployedAtBlock_,
    exchangeRate_
  );

  return {
    underlying: underlying_,
    symbol: symbol_,
    decimals: decimals_,
    totalUnderlying: bnToNum(totalUnderlying_, decimals_),
    price: price_,
    baseApy: apr.base,
    crvApy: apr.crv,
  };
};

const pools = async (addresses_) => {
  const [apyData, poolData] = await Promise.all([
    curveApyData(),
    curvePoolData(),
  ]);
  return Promise.all(addresses_.map((a) => pool(a, apyData, poolData)));
};

const conicApy = async () => {
  const addresses_ = await addresses();
  const [pools_, inflationRate_, cncPrice_] = await Promise.all([
    pools(addresses_),
    inflationRate(),
    priceCoin(CNC),
  ]);

  const cncUsdPerYear = bnToNum(inflationRate_) * cncPrice_ * 365 * 86400;
  const totalTvl = pools_.reduce((total, pool_) => {
    return total + pool_.totalUnderlying * pool_.price;
  }, 0);
  const cncApy = (cncUsdPerYear / totalTvl) * 100;
  return Promise.all(
    pools_.map(async (pool_) => {
      const tvlUsd = pool_.totalUnderlying * pool_.price;
      return {
        pool: `conic-${pool_.symbol}-ethereum`.toLowerCase(),
        chain: 'Ethereum',
        project: 'conic-finance',
        symbol: pool_.symbol === 'WETH' ? 'ETH' : pool_.symbol,
        tvlUsd,
        rewardTokens: [CNC, CRV, CVX],
        underlyingTokens: [pool_.underlying],
        apyBase: pool_.baseApy,
        apyReward: pool_.crvApy + cncApy,
      };
    })
  );
};

module.exports = {
  timetravel: false,
  apy: conicApy,
  url: 'https://conic.finance/',
};
