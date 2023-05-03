const { lookupApplications } = require('./helper/chain/algorand');

function fromIntToBytes8Hex(num) {
  return num.toString(16).padStart(16, '0');
}

function encodeToBase64(str, encoding = 'utf8') {
  return Buffer.from(str, encoding).toString('base64');
}

function parseOracleValue(base64Value) {
  const value = Buffer.from(base64Value, 'base64').toString('hex');
  // first 8 bytes are the price
  const price = BigInt('0x' + value.slice(0, 16));

  return price;
}

function getParsedValueFromState(state, key, encoding = 'utf8') {
  const encodedKey = encoding ? encodeToBase64(key, encoding) : key;
  const keyValue = state.find((entry) => entry.key === encodedKey);
  if (keyValue === undefined) return;
  const { value } = keyValue;
  if (value.type === 1) return value.bytes;
  if (value.type === 2) return BigInt(value.uint);
  return;
}

async function getAppState(appId) {
  const res = await lookupApplications(appId);
  return res.application.params['global-state'];
}

/**
 * Calculate the sqrt of a bigint (rounded down to nearest integer)
 * @param value value to be square-rooted
 * @return bigint sqrt
 */
function sqrt(value) {
  if (value < BigInt(0))
    throw Error('square root of negative numbers is not supported');

  if (value < BigInt(2)) return value;

  function newtonIteration(n, x0) {
    const x1 = (n / x0 + x0) >> BigInt(1);
    if (x0 === x1 || x0 === x1 - BigInt(1)) return x0;
    return newtonIteration(n, x1);
  }

  return newtonIteration(value, BigInt(1));
}

module.exports = {
  fromIntToBytes8Hex,
  parseOracleValue,
  getParsedValueFromState,
  getAppState,
};
