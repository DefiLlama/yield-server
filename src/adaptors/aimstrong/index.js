const { ethers } = require('ethers');
const axios = require('axios');

const config = {
  Base: {
    pool: '0x7c94606f2240E61E242D14Ed984Aa38FA4C79c0C',
    factory: '0xb28ee1F4Ae2C8082a6c06c446C79aD8173d988e4',
    rewardToken: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
  },
  Arbitrum: {
    pool: '0x7c94606f2240E61E242D14Ed984Aa38FA4C79c0C',
    factory: '0x2659e4a192D4f9541267578BD4ae41D391774A06',
    rewardToken: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
  },
};

const SECONDS_IN_YEAR = ethers.BigNumber.from(365 * 24 * 60 * 60);
const TEN_POW_27 = ethers.BigNumber.from('1000000000000000000000000000');
const PRECISION_FACTOR = 10000;

const poolABI = [
  'function getReservesList() external view returns (address[] memory)',
  'function getReserveData(address asset) external view returns (tuple(tuple(uint256 data) configuration, uint128 liquidityIndex, uint128 variableBorrowIndex, uint128 currentLiquidityRate, uint128 currentVariableBorrowRate, uint40 lastUpdateTimestamp, address tTokenAddress, address variableDebtTokenAddress, address interestRateStrategyAddress, uint8 id))',
];
const incentivesFactoryABI = [
  'function getVault(address token) external view returns (address)',
];
const incentivesControllerABI = [
  'function ratePerSecond() external view returns (uint256)',
  'function tokenStaked() external view returns (address)',
  'function tokenRewards() external view returns (address)',
];
const erc20ABI = [
  'function decimals() external view returns (uint8)',
  'function symbol() external view returns (string)',
  'function totalSupply() external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
];

const apy = async () => {
  const providers = {
    Base: new ethers.providers.JsonRpcProvider('https://base.llamarpc.com'),
    Arbitrum: new ethers.providers.JsonRpcProvider(
      'https://arb1.arbitrum.io/rpc'
    ),
  };

  const pools = [];

  for (const [chainName, provider] of Object.entries(providers)) {
    const pool = new ethers.Contract(config[chainName].pool, poolABI, provider);
    const reservesList = await pool.getReservesList();

    for (const reserveAddress of reservesList) {
      const reserveData = await pool.getReserveData(reserveAddress);

      const token = new ethers.Contract(reserveAddress, erc20ABI, provider);
      const symbol = await token.symbol();
      const decimals = await token.decimals();
      const totalSupply = await token.totalSupply();

      const currentLiquidityRate = parseFloat(
        ethers.utils.formatUnits(reserveData.currentLiquidityRate, 27)
      );
      const currentVariableBorrowRate = parseFloat(
        ethers.utils.formatUnits(reserveData.currentVariableBorrowRate, 27)
      );

      const apyBase = currentLiquidityRate * 100;
      const apyBaseBorrow = currentVariableBorrowRate * 100;

      let apyReward = 0;
      const incentivesControllerAddr = await getIncentivesController(
        provider,
        reserveAddress,
        chainName
      );
      if (
        incentivesControllerAddr &&
        incentivesControllerAddr !== ethers.constants.AddressZero
      ) {
        apyReward = await getRewardApy(
          provider,
          incentivesControllerAddr,
          reserveAddress,
          chainName
        );
      }

      const tTokenBalance = await token.balanceOf(reserveData.tTokenAddress);

      const tokenPrice = await getPrice(reserveAddress, chainName);
      const priceInUsd = parseFloat(ethers.utils.formatUnits(tokenPrice, 18));

      const tvlUsd =
        parseFloat(ethers.utils.formatUnits(tTokenBalance, decimals)) *
        priceInUsd;
      const totalSupplyInUsd =
        parseFloat(ethers.utils.formatUnits(totalSupply, decimals)) *
        priceInUsd;
      const totalBorrowInUsd = Math.max(0, totalSupplyInUsd - tvlUsd);

      const poolData = {
        pool: `${reserveData.tTokenAddress}-${chainName}`.toLowerCase(),
        chain: chainName,
        project: 'aimstrong',
        symbol: symbol,
        tvlUsd: tvlUsd,
        apyBase: apyBase > 0 ? apyBase : null,
        apyReward: apyReward > 0 ? apyReward : null,
        rewardTokens:
          apyReward > 0 ? [config[chainName].rewardToken] : undefined,
        underlyingTokens: [reserveAddress],
        apyBaseBorrow: apyBaseBorrow > 0 ? apyBaseBorrow : null,
      };

      if (apyBase > 0 || apyReward > 0) {
        pools.push(poolData);
      }
    }
  }

  return pools;
};

async function getIncentivesController(provider, token, chainName) {
  const factory = new ethers.Contract(
    config[chainName].factory,
    incentivesFactoryABI,
    provider
  );
  const controllerAddress = await factory.getVault(token);
  return controllerAddress;
}

async function getRewardApy(provider, icAddr, tokenAddr, chainName) {
  const controller = new ethers.Contract(
    icAddr,
    incentivesControllerABI,
    provider
  );

  const rps = await controller.ratePerSecond();
  const stakeTokenAddr = await controller.tokenStaked();
  const rewardTokenAddr = await controller.tokenRewards();

  const stakeToken = new ethers.Contract(stakeTokenAddr, erc20ABI, provider);
  const rewardToken = new ethers.Contract(rewardTokenAddr, erc20ABI, provider);

  const stakeDecimals = await stakeToken.decimals();
  const rewardDecimals = await rewardToken.decimals();

  const stakeRawPrice = await getPrice(stakeTokenAddr, chainName);
  const rewardRawPrice = await getPrice(rewardTokenAddr, chainName);

  const stakeUnitPrice = ethers.utils.parseUnits(
    ethers.utils.formatUnits(stakeRawPrice, stakeDecimals),
    18
  );
  const rewardUnitPrice = ethers.utils.parseUnits(
    ethers.utils.formatUnits(rewardRawPrice, rewardDecimals),
    18
  );

  const numerator = rps.mul(SECONDS_IN_YEAR).mul(rewardUnitPrice);
  const denominator = stakeUnitPrice.mul(TEN_POW_27);
  const apyWithPrecision = numerator.mul(PRECISION_FACTOR).div(denominator);

  return parseFloat(ethers.utils.formatUnits(apyWithPrecision, 2));
}

async function getPrice(tokenAddress, chainName) {
  const priceKey = `${chainName.toLowerCase()}:${tokenAddress.toLowerCase()}`;
  const response = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const price = response.data.coins[priceKey]?.price || 1;
  return ethers.utils.parseUnits(price.toString(), 18);
}

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.aimstrong.ai/lending',
};
