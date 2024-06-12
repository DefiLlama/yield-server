module.exports = {
  balanceOf: 'erc20:balanceOf',
  totalSupply: 'erc20:totalSupply',
  totalAssets: 'function totalAssets() public view returns (uint256)',
  totalCollateral: 'function totalCollateral() public view returns (uint256)',
  totalDebt: 'function totalDebt() public view returns (uint256)',
  getStETH: 'function getStETHByWstETH(uint256) public view returns (uint256)',
  usdcBalance: 'function usdcBalance() public view returns (uint256)',
  slippage: 'function slippageTolerance() public view returns (uint256)',
  ethToUsdc: 'function ethToUsdc(uint256) public view returns (uint256)',
  lqtyGain:
    'function getDepositorLQTYGain(address) public view returns (uint256)',
};
