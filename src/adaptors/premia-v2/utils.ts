const {
  utils: { formatUnits, formatEther },
} = require('ethers');
const ContractAbi = require('./abi');
const sdk = require('@defillama/sdk');
const {
  PREMIA_MINING_CONTRACT_ADDRESS,
  PREMIA_TOKEN_ADDRESS,
} = require('./addresses');

export interface PoolType {
  pool: string;
  chain: string;
  project: string;
  symbol: string;
  tvlUsd: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: Array<string>;
  underlyingTokens?: Array<string>;
  poolMeta?: string;
  url?: string;
  apyBaseBorrow?: number;
  apyRewardBorrow?: number;
  totalSupplyUsd?: number;
  totalBorrowUsd?: number;
  ltv?: number;
  apyBaseInception?: number;
}

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
}

interface FetchedPool {
  id: string;
  name: string;
  address: string;
  netSizeInUsd: string;
  openInterestInUsd: string;
  underlying: Token;
  profitLossPercentage: string;
  totalLocked: string;
  optionType: 'CALL' | 'PUT';
  netSize: string;
  base: Token;
  annualPercentageReturn: string;
}

export interface PoolInfo {
  allocPoint: string;
}

const isCall = (value: string) => {
  return value === 'CALL';
};

const weiToNumber = (value: string) => {
  if (!value) return 0;
  return Number(formatEther(value));
};

const getCall = async (chain, method, params = []) =>
  await sdk.api.abi.call({
    chain,
    target: PREMIA_MINING_CONTRACT_ADDRESS[chain],
    abi: ContractAbi.find((e) => e.name === method),
    params,
  });

async function getChainRewardData(chain) {
  const result = await Promise.all([
    getCall(chain, 'getPremiaPerYear'),
    getCall(chain, 'getTotalAllocationPoints'),
  ]);

  return {
    premiaPerYear: result[0].output,
    totalAllocations: result[1].output,
  };
}

async function getPoolRewardInfo(chain, pool): Promise<PoolInfo> {
  const result = await getCall(chain, 'getPoolInfo', [
    pool.address,
    isCall(pool.optionType),
  ]);

  return {
    allocPoint: result.output.allocPoint as string,
  };
}

interface CalcAPYParam {
  premiaPerYear: BigNumber;
  totalAllocations: BigNumber;
  poolInfo: PoolInfo;
  premiaPrice: number;
  pool: FetchedPool;
}

function calcRewardAPY({
  premiaPerYear,
  totalAllocations,
  poolInfo,
  premiaPrice,
  pool,
}: CalcAPYParam): number {
  const { netSizeInUsd } = pool;
  const { allocPoint } = poolInfo;
  const _totalAllocations = Number(formatUnits(totalAllocations, 0));
  const _allocPoints = Number(formatUnits(allocPoint, 0));
  const _premiaPerYear = Number(formatUnits(premiaPerYear, 18));
  const premiaPerYearToThisPool =
    (_allocPoints / _totalAllocations) * _premiaPerYear;
  if (!netSizeInUsd || !_totalAllocations) {
    return 0;
  }
  const USDValueOfYearlyPoolRewards = premiaPerYearToThisPool * premiaPrice;

  const poolAPY =
    (USDValueOfYearlyPoolRewards / Number(formatEther(netSizeInUsd))) * 100;

  if (poolAPY) {
    return Number(poolAPY.toFixed(2));
  }
  return 0;
}

async function convert(
  fetchedPool: FetchedPool,
  chain: string,
  chainRewardData,
  price: number
): PoolType {
  const { name, netSizeInUsd, underlying, id, annualPercentageReturn } =
    fetchedPool;
  const poolReward = await getPoolRewardInfo(chain, fetchedPool);
  const rewardAPY = await calcRewardAPY({
    ...chainRewardData,
    poolInfo: poolReward,
    pool: fetchedPool,
    premiaPrice: price,
  });

  return {
    chain,
    pool: id,
    poolMeta: name,
    underlyingTokens: [underlying.address],
    apyReward: rewardAPY,
    rewardTokens: [PREMIA_TOKEN_ADDRESS[chain]],
    tvlUsd: weiToNumber(netSizeInUsd),
    project: 'premia-v2',
    symbol: underlying.symbol,
    apyBase: weiToNumber(annualPercentageReturn),
    apyBaseInception: weiToNumber(annualPercentageReturn),
  };
}

module.exports = {
  calcRewardAPY,
  convert,
  getChainRewardData,
};
