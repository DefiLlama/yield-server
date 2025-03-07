const fetchTVL = require('./fetchTVL');
const computeAPY = require('./computeAPY');
const contractAddresses = require('./addresses');

const poolsFunction = async () => {
  const pools = [];
  const APYs = {};

  for (const [chain, tokens] of Object.entries(contractAddresses)) {
    for (const [token, tokenData] of Object.entries(tokens)) {
      if (!(token in APYs)) {
        APYs[token] = await computeAPY(
          contractAddresses['ethereum'][token].address
        );
      }

      const tvlUsd = await fetchTVL(chain, token);

      pools.push({
        pool: `${tokenData.address.toLowerCase()}-${chain.toLowerCase()}`,
        chain,
        project: 'midas-rwa',
        symbol: token,
        tvlUsd: tvlUsd,
        // apyBase: APYs[token],
        apyBase7d: APYs[token],
        url: tokenData.url,
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://midas.app/',
};
