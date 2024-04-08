const keomABI = [
  'function supplyRatePerTimestamp() view returns (uint256)',
  'function borrowRatePerTimestamp() view returns (uint256)',
  'function exchangeRateStored() view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function name() external view returns (string memory)',
  'function totalSupply() view returns (uint256)',
  'function totalBorrows() external view returns(uint)',
  'function symbol() external view returns (string)',
  'function underlying() external view returns (address)',
];

const erc20ABI = [
  'function decimals() external pure returns (uint8)',
  'function balanceOf(address owner) external view returns (uint256 balance)',
];

const unitrollerABI = [
  'function getAllMarkets() external view returns(address[] memory)',
  'function markets(address) external view returns(bool isListed,bool autoCollaterize,uint256 collateralFactorMantissa)',
];

const oracleABI = [
  'function getUnderlyingPrice(address oToken) view  returns (uint)',
  'function borrowBalanceStored(address account) view returns (uint256)',
];

const rewardsManagerABI = [
  "function getMarketRewardSpeeds(address rewardToken, address market) view returns (uint256 supplySpeed, uint256 borrowSpeed)",
  "function getRewardTokensForMarket(address market) view  returns (address[] memory)",
  "function getRewardedMarkets(IKToken[] calldata markets, address rewardToken) view returns (bool[])",
  "function getAllRewardsTokens() external view returns (address[])"
]



module.exports = {
  keomABI,
  erc20ABI,
  unitrollerABI,
  oracleABI,
  rewardsManagerABI
};
