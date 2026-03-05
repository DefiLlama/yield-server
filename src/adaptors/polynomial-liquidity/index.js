const utils = require('../utils');
const axios = require('axios');

const API_URL =
  'https://perps-api-mainnet.polynomial.finance/vaults/all?chainId=8008';
const LIQUIDITY_URL = 'https://polynomial.fi/en/mainnet/earn/liquidity';

// Token addresses on Polynomial chain (chainId 8008)
const COLLATERAL_TOKENS = {
  fxUSDC: '0x2369eb4a76d80fbeaa7aa73e1e1f9eaee88c07f4',
  sDAI: '0x615172e47c0C5A6dA8ea959632Ac0166f7a59eDc',
  sUSDe: '0x2A06DEAc3E863c23DD6a89Eeacd80aBA9E08B77B',
  USD0: '0x6224dC817dC4D5c53fcF3eb08A4f84C456F9f38f',
  USDC: '0x17C9D8Cef7Ef072844EEaEdE1F9f54C7E3fa8743',
  wETH: '0x6225bC323f277e3D342Ec600d132aCc7beDA1fc0',
  wstEth: '0xb825f0997824Fe07DaB51Fa7Da9f4c864F19eb82',
  weETH: '0xb1987E120E827339380bf429a82550f46AcAB8b4',
  solvBtc: '0x035B6f6E50D8c250d80E3f919bBcC76aD2884c94',
};

const getApy = async () => {
  const { data } = await axios.get(API_URL, {
    maxBodyLength: Infinity,
    headers: {
      'User-Agent': 'defillama (aws-lambda)',
      Accept: 'application/json',
    },
  });

  return data.map((pool) => {
    const collateralType = pool.collateralType === 'fxUSDC' ? 'USDC' : pool.collateralType;
    const tokenAddr = COLLATERAL_TOKENS[pool.collateralType];
    return {
      pool: `${pool.poolId}-${pool.collateralType}`,
      chain: 'polynomial',
      project: 'polynomial-liquidity',
      symbol: collateralType,
      tvlUsd: pool.tvl,
      apyBase: pool.apr + pool.baseApr,
      apyReward: pool.opRewardsApr,
      rewardTokens: ['0x4200000000000000000000000000000000000042'],
      underlyingTokens: tokenAddr ? [tokenAddr] : undefined,
      url: LIQUIDITY_URL,
    };
  });
};

async function main() {
  let data = await getApy();
  return data;
}

module.exports = {
  timetravel: false,
  apy: main,
};
