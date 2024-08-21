const { ethers, BigNumber } = require('ethers');

const hashData = (dataTypes, dataValues) => {
  const bytes = ethers.utils.defaultAbiCoder.encode(dataTypes, dataValues);
  const hash = ethers.utils.keccak256(ethers.utils.arrayify(bytes));

  return hash;
};

const hashString = (string) => {
  return hashData(['string'], [string]);
};

const bigNumberify = (n) => {
  try {
    return BigNumber(n);
  } catch (e) {
    console.error('bigNumberify error', e);
    return undefined;
  }
};

const expandDecimals = (n, decimals) => {
  return BigInt(n) * BigInt(10 ** decimals);
};

const bigintToNumber = (value, decimals) => {
  let myValue = value;
  const negative = myValue < 0;
  if (negative) {
    myValue *= -1n;
  }
  const precision = BigInt(10) ** BigInt(decimals);
  const int = myValue / precision;
  const frac = myValue % precision;

  const num = parseFloat(`${int}.${frac.toString().padStart(decimals, '0')}`);
  return negative ? -num : num;
};

const numberToBigint = (value, decimals) => {
  let myValue = value;
  const negative = value < 0;
  if (negative) {
    myValue *= -1;
  }

  const int = Math.trunc(myValue);
  let frac = myValue - int;

  let res = BigInt(int);

  for (let i = 0; i < decimals; i++) {
    res *= 10n;
    if (frac !== 0) {
      frac *= 10;
      const fracInt = Math.trunc(frac);
      res += BigInt(fracInt);
      frac -= fracInt;
    }
  }

  return negative ? -res : res;
};

module.exports = {
  hashData,
  hashString,
  bigNumberify,
  expandDecimals,
  bigintToNumber,
  numberToBigint,
};
