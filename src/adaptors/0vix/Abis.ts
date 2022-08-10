
const OvixABI = [
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
  "function supplyRatePerTimestamp() view returns (uint256)",
  "function borrowRatePerTimestamp() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
    "function underlying() view returns (address)",
];

const erc20ABI = [
  "function decimals() external pure returns (uint8)",
  "function balanceOf(address owner) external view returns (uint256 balance)",
];

const oracleABI = [
  "function getUnderlyingPrice(address oToken) view  returns (uint)",
  "function borrowBalanceStored(address account) view returns (uint256)",
];

module.exports = {
  OvixABI,
  erc20ABI,
  oracleABI
};
