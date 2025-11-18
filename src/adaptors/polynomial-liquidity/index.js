const utils = require('../utils');
const axios = require('axios');

const API_URL =
  'https://perps-api-mainnet.polynomial.finance/vaults/all?chainId=8008';
// LIUIDITY UI
const LIQUIDITY_URL = 'https://polynomial.fi/en/mainnet/earn/liquidity';

const getApy = async () => {
  // APR is retrieved using our api, tvl pairs etc trough subgraph

  const { data } = await axios.get(
    'https://perps-api-mainnet.polynomial.finance/vaults/all?chainId=8008',
    {
      maxBodyLength: Infinity,
      headers: {
        'User-Agent': 'defillama (aws-lambda)',
        Accept: 'application/json',
      },
    }
  );

  const poolInfo = await Promise.all(
    data.map(async (pool) => {
      return {
        pool: `${pool.poolId}-${pool.collateralType}`,
        chain: 'polynomial',
        project: 'polynomial-liquidity',
        symbol: pool.collateralType === 'fxUSDC' ? 'USDC' : pool.collateralType,
        tvlUsd: pool.tvl,
        apyBase: pool.apr + pool.baseApr,
        apyReward: pool.opRewardsApr,
        rewardTokens: ['0x4200000000000000000000000000000000000042'],
        url: LIQUIDITY_URL,
      };
    })
  );
  return poolInfo;
};

async function main() {
  let data = await getApy();
  return data;
}

module.exports = {
  timetravel: false,
  apy: main,
};
