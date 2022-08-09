
const OvixABI = [
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function decimals() view returns (uint8)",
];

const erc20ABI = [
  "function decimals() external pure returns (uint8)",
  "function balanceOf(address owner) external view returns (uint256 balance)",
];


module.exports = {
  OvixABI,
  erc20ABI,
};
