
const OvixABI = [
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function decimals() view returns (uint8)",
  'function name() external view returns (string memory)',
  'function totalSupply() view returns (uint256)',
    'function totalBorrows() external view returns(uint)'
];

const erc20ABI = [
  "function decimals() external pure returns (uint8)",
  "function balanceOf(address owner) external view returns (uint256 balance)",
];

const unitrollerABI = [
  'function getAllMarkets() external view returns(address[] memory)',
];

const oracleABI = [
  'function getUnderlyingPrice(address oToken) view  returns (uint)',
  'function borrowBalanceStored(address account) view returns (uint256)',
];

const preminingABI = [
  "event AddedRewards(uint256)",
  "event AdjustedReward(address indexed,uint256)",
  "event CollectedRewards(address indexed,uint256)",
  "event Initialized(uint8)",
  "event OwnershipTransferred(address indexed,address indexed)",
  "event Paused(address)",
  "event SetAllMarkets(address[])",
  "event SetMarketRewards(address indexed,uint256,uint256 indexed)",
  "event SetVixToken(address)",
  "event Unpaused(address)",
  "function addRewards(tuple(address,uint256)[],uint256)",
  "function allMarkets(uint256) view returns (address)",
  "function claimVixReward()",
  "function editRewards(tuple(address,uint256)[])",
  "function getAllMarketRewards() view returns (tuple(address,uint256)[])",
  "function initialize()",
  "function marketRewards(address) view returns (uint256)",
  "function owner() view returns (address)",
  "function pause()",
  "function paused() view returns (bool)",
  "function renounceOwnership()",
  "function setMarkets(address[])",
  "function setRewardsForMarkets(tuple(address,uint256)[],uint256)",
  "function setVixToken(address)",
  "function transferOwnership(address)",
  "function unpause()",
  "function userRewards(address) view returns (uint256)",
  "function vixToken() view returns (address)"
];


module.exports = {
  OvixABI,
  erc20ABI,
  unitrollerABI,
  oracleABI,
  preminingABI,
};
