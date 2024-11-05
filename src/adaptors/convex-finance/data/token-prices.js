const fetch = require('node-fetch')

// [['a', '1'], ['b', 2], …] -> { a: 1, b: 2, … }
const arrayToHashmap = (array) => (
  Object.assign({}, ...array.map(([key, val]) => ({ [key]: val })))
);

const getTokensPrices = async (addresses, platform = 'ethereum') => (
  (await fetch(`https://coins.llama.fi/prices/current/${addresses.map((a) => `${platform}:${a}`).join(',')}`)).json()
    .then(({ coins: prices }) => arrayToHashmap(Object.entries(prices).map(([platformAndAddress, { price: usdPrice }]) => [
      platformAndAddress.split(':')[1].toLowerCase(),
      usdPrice,
    ])))
);

module.exports = {
  getTokensPrices,
};
