/**
 * Library to manage fixed-point arithmetic.
 * https://github.com/morpho-org/morpho-blue/blob/main/src/libraries/MathLib.sol
 */

const WAD = 1_000000000000000000n;
const RAY = 1_000000000000000000000000000n;

const maxUint = (nBits) => {
    if (nBits % 4 !== 0) throw new Error(`Invalid number of bits: ${nBits}`);
    
    return BigInt(`0x${"f".repeat(nBits / 4)}`);
    }

const MAX_UINT_256 = maxUint(256);
const MAX_UINT_160 = maxUint(160);
const MAX_UINT_128 = maxUint(128);
const MAX_UINT_48 = maxUint(48);

/**
 * Returns the absolute value of a number
 * @param a The number
 */
const abs = (a) => {
a = BigInt(a);

return a >= 0 ? a : -a;
}

/**
 * Returns the smallest number given as param
 * @param x The first number
 * @param y The second number
 */
const min = (...xs) => {
return xs.map(BigInt).reduce((x, y) => (x <= y ? x : y));
}

/**
 * Returns the greatest number given as param
 * @param x The first number
 * @param y The second number
 */
const max = (...xs) => {
return xs.map(BigInt).reduce((x, y) => (x <= y ? y : x));
}

/**
 * Returns the subtraction of b from a, floored to zero if negative
 * @param x The first number
 * @param y The second number
 */
const zeroFloorSub = (x, y) => {
x = BigInt(x);
y = BigInt(y);

return x <= y ? 0n : x - y;
}

/**
 * Perform the WAD-based multiplication of 2 numbers, rounded down
 * @param x The first number
 * @param y The second number
 */
const wMulDown = (x, y) => {
return wMul(x, y, "Down");
}

/**
 * Perform the WAD-based multiplication of 2 numbers, rounded up
 * @param x The first number
 * @param y The second number
 */
const wMulUp = (x, y) => {
return wMul(x, y, "Up");
}

/**
 * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
 * @param x The first number
 * @param y The second number
 */
const wMul = (
x,
y,
rounding,
) => {
return mulDiv(x, y, WAD, rounding);
}

/**
 * Perform the WAD-based division of 2 numbers, rounded down
 * @param x The first number
 * @param y The second number
 */
const wDivDown = (x, y) => {
return wDiv(x, y, "Down");
}

/**
 * Perform the WAD-based multiplication of 2 numbers, rounded up
 * @param x The first number
 * @param y The second number
 */
const wDivUp = (x, y) => {
return wDiv(x, y, "Up");
}

/**
 * Perform the WAD-based multiplication of 2 numbers with a provided rounding direction
 * @param x The first number
 * @param y The second number
 */
const wDiv = (
x,
y,
rounding,
) => {
return mulDiv(x, WAD, y, rounding);
}

/**
 * Multiply two numbers and divide by a denominator, rounding down the result
 * @param x The first number
 * @param y The second number
 * @param denominator The denominator
 */
const mulDivDown = (
x,
y,
denominator,
) => {
x = BigInt(x);
y = BigInt(y);
denominator = BigInt(denominator);
if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

return (x * y) / denominator;
}

/**
 * Multiply two numbers and divide by a denominator, rounding up the result
 * @param x The first number
 * @param y The second number
 * @param denominator The denominator
 */
const mulDivUp = (x, y, denominator) => {
x = BigInt(x);
y = BigInt(y);
denominator = BigInt(denominator);
if (denominator === 0n) throw Error("MathLib: DIVISION_BY_ZERO");

const roundup = (x * y) % denominator > 0 ? 1n : 0n;

return (x * y) / denominator + roundup;
}

const mulDiv = (
x,
y,
denominator,
rounding,
) => {
    if (rounding === "Down") {
        return mulDivDown(x, y, denominator);
    } else if (rounding === "Up") {
        return mulDivUp(x, y, denominator);
    } else {
        throw new Error(`Invalid rounding: ${rounding}`);
    }
}

/**
 * The sum of the first three non-zero terms of a Taylor expansion of e^(nx) - 1,
 * to approximate a continuously compounded interest rate.
 *
 * @param x The base of the exponent
 * @param n The exponent
 */
const wTaylorCompounded = (x, n) => {
const firstTerm = BigInt(x) * BigInt(n);
const secondTerm = mulDivDown(
    firstTerm,
    firstTerm,
    2n * WAD,
);
const thirdTerm = mulDivDown(
    secondTerm,
    firstTerm,
    3n * WAD,
);

return firstTerm + secondTerm + thirdTerm;
}

/**
 * Converts a WAD-based quantity to a RAY-based quantity.
 * @param x The WAD-based quantity.
 */
const wToRay = (x) => {
  return BigInt(x) * 1_000000000n;
}

module.exports = {
  abs,
  min,
  max,
  zeroFloorSub,
  wMulDown,
  wMulUp,
  wMul,
  wDivDown,
  wDivUp,
  wDiv,
  mulDivDown,
  mulDivUp,
  mulDiv,
  wTaylorCompounded,
  MAX_UINT_256,
  MAX_UINT_160,
  MAX_UINT_128,
  MAX_UINT_48,
  WAD,
  RAY,
};
