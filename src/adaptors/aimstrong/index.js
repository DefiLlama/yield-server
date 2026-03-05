const sdk = require('@defillama/sdk');
const axios = require('axios');

const abi = {
  getReservesList: 'function getReservesList() view returns (address[])',
  getReserveData:
    'function getReserveData(address asset) external view returns (tuple(tuple(uint256 data) configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint40 lastUpdateTimestamp, address tTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id))',
  totalSupply: 'function totalSupply() external view returns (uint256)',
  symbol: 'function symbol() external view returns (string)',
  decimals: 'function decimals() external view returns (uint8)',
  getVault: 'function getVault(address token) external view returns (address)',
  ratePerSecond: 'function ratePerSecond() external view returns (uint256)',
  tokenStaked: 'function tokenStaked() external view returns (address)',
  tokenRewards: 'function tokenRewards() external view returns (address)',
};

const config = {
  base: {
    pool: '0x7c94606f2240E61E242D14Ed984Aa38FA4C79c0C',
    factory: '0xb28ee1F4Ae2C8082a6c06c446C79aD8173d988e4',
    rewardToken: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  arbitrum: {
    pool: '0x7c94606f2240E61E242D14Ed984Aa38FA4C79c0C',
    factory: '0x2659e4a192D4f9541267578BD4ae41D391774A06',
    rewardToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
};

const SECONDS_IN_YEAR = 365 * 24 * 60 * 60;
const TEN_POW_27 = 10 ** 27;
const PRECISION_FACTOR = 10000;

const apy = async () => {
  const chains = ['base', 'arbitrum'];
  const pools = [];

  for (const chain of chains) {
    const reservesList = await sdk.api.abi.call({
      abi: abi.getReservesList,
      target: config[chain].pool,
      chain,
    });

    for (const reserveAddress of reservesList.output) {
      const reserveData = await sdk.api.abi.call({
        abi: abi.getReserveData,
        target: config[chain].pool,
        params: [reserveAddress],
        chain,
      });

      const [symbol, decimals] = await Promise.all([
        sdk.api.abi.call({
          abi: abi.symbol,
          target: reserveAddress,
          chain,
        }),
        sdk.api.abi.call({
          abi: abi.decimals,
          target: reserveAddress,
          chain,
        }),
      ]);

      const currentLiquidityRate =
        reserveData.output.currentLiquidityRate / TEN_POW_27;
      const currentVariableBorrowRate =
        reserveData.output.currentVariableBorrowRate / TEN_POW_27;

      const apyBase = currentLiquidityRate * 100;
      const apyBaseBorrow = currentVariableBorrowRate * 100;

      let apyReward = 0;
      const incentivesControllerAddr = await getIncentivesController(
        reserveAddress,
        chain
      );
      if (
        incentivesControllerAddr &&
        incentivesControllerAddr !==
          '0x0000000000000000000000000000000000000000'
      ) {
        apyReward = await getRewardApy(incentivesControllerAddr, chain);
      }

      const [tTokenTotalSupply, variableDebtTotalSupply] = await Promise.all([
        sdk.api.abi.call({
          abi: abi.totalSupply,
          target: reserveData.output.tTokenAddress,
          chain,
        }),
        sdk.api.abi.call({
          abi: abi.totalSupply,
          target: reserveData.output.variableDebtTokenAddress,
          chain,
        }),
      ]);

      const priceInUsd = await getPrice(reserveAddress, chain);

      const totalSupplyUsd =
        (tTokenTotalSupply.output / 10 ** decimals.output) * priceInUsd;
      const totalBorrowUsd =
        (variableDebtTotalSupply.output / 10 ** decimals.output) * priceInUsd;

      const tvlUsd = totalSupplyUsd - totalBorrowUsd;

      const poolData = {
        pool: `${reserveData.output.tTokenAddress}-${chain}`.toLowerCase(),
        chain: chain.charAt(0).toUpperCase() + chain.slice(1),
        project: 'aimstrong',
        symbol: symbol.output,
        tvlUsd: tvlUsd,
        apyBase: apyBase > 0 ? apyBase : null,
        apyReward: apyReward > 0 ? apyReward : null,
        rewardTokens: apyReward > 0 ? [config[chain].rewardToken] : undefined,
        underlyingTokens: [reserveAddress],
        apyBaseBorrow: apyBaseBorrow > 0 ? apyBaseBorrow : null,
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
      };

      if (apyBase > 0 || apyReward > 0) {
        pools.push(poolData);
      }
    }
  }

  return pools;
};

async function getIncentivesController(token, chain) {
  const controllerAddress = await sdk.api.abi.call({
    abi: abi.getVault,
    target: config[chain].factory,
    params: [token],
    chain,
  });
  return controllerAddress.output;
}

async function getRewardApy(icAddr, chain) {
  const [rps, stakeTokenAddr, rewardTokenAddr] = await Promise.all([
    sdk.api.abi.call({
      abi: abi.ratePerSecond,
      target: icAddr,
      chain,
    }),
    sdk.api.abi.call({
      abi: abi.tokenStaked,
      target: icAddr,
      chain,
    }),
    sdk.api.abi.call({
      abi: abi.tokenRewards,
      target: icAddr,
      chain,
    }),
  ]);

  const [stakeDecimals, rewardDecimals] = await Promise.all([
    sdk.api.abi.call({
      abi: abi.decimals,
      target: stakeTokenAddr.output,
      chain,
    }),
    sdk.api.abi.call({
      abi: abi.decimals,
      target: rewardTokenAddr.output,
      chain,
    }),
  ]);

  const stakeUnitPrice = await getPrice(stakeTokenAddr.output, chain);
  const rewardUnitPrice = await getPrice(rewardTokenAddr.output, chain);

  const numerator =
    (rps.output * SECONDS_IN_YEAR * rewardUnitPrice) /
    10 ** rewardDecimals.output;
  const denominator =
    (stakeUnitPrice * TEN_POW_27) / 10 ** stakeDecimals.output;
  const apyWithPrecision = (numerator * PRECISION_FACTOR) / denominator;

  return apyWithPrecision / 100;
}

async function getPrice(tokenAddress, chain) {
  const priceKey = `${chain}:${tokenAddress.toLowerCase()}`;
  const response = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const price = response.data.coins[priceKey]?.price || 1;
  return price;
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.aimstrong.ai/lending',
};
