const { formatUnits } = require('ethers/lib/utils');

const fetchMTokenPrice = require('./fetchMTokenPrice');
const fetchTotalSupply = require('./fetchTotalSupply');

const fetchTVL = async (chain, token) => {
  const supply = await fetchTotalSupply(chain, token);
  const price = await fetchMTokenPrice('ethereum', token);

  // @ts-ignore
  const tvlRaw = (supply * BigInt(price)) / 10n ** 18n;
  return Number(formatUnits(tvlRaw.toString(), 18));
};

module.exports = fetchTVL;
