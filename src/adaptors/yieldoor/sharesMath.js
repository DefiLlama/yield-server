const MathLib = require('./mathLib');

/**
 * JS implementation of {@link https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/SharesMathLib.sol SharesMathLib} used by Morpho Blue
 * & MetaMorpho (via {@link https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/token/ERC20/extensions/ERC4626.sol ERC4626}).
 */

const VIRTUAL_SHARES = 1000000n;
const VIRTUAL_ASSETS = 1n;

const toAssets = (
  shares,
  totalAssets,
  totalShares,
  rounding,
) => {
  return MathLib.mulDiv(
    shares,
    BigInt(totalAssets) + VIRTUAL_ASSETS,
    BigInt(totalShares) + VIRTUAL_SHARES,
    rounding,
  );
}

const toShares = (
  assets,
  totalAssets,
  totalShares,
  rounding,
) => {
  return MathLib.mulDiv(
    assets,
    BigInt(totalShares) + VIRTUAL_SHARES,
    BigInt(totalAssets) + VIRTUAL_ASSETS,
    rounding,
  );
}

module.exports = {
  toAssets,
  toShares,
};