
const OvixABI = [
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function decimals() view returns (uint8)",
  'function name() external view returns (string memory)',
];

const erc20ABI = [
  "function decimals() external pure returns (uint8)",
  "function balanceOf(address owner) external view returns (uint256 balance)",
];

const unitrollerABI = [
  'function getAllMarkets() external view returns(address[] memory)',
];


module.exports = {
  OvixABI,
  erc20ABI,
  unitrollerABI
};
