const dataFeedAbi = require('./abi/dataFeedAbi.json');
const basicDataFeedAbi = require('./abi/basicDatafeedAbi.json');
const sdk = require('@defillama/sdk');
const contractAddresses = require('./addresses');

const fetchMTokenPrice = async (chain, token) => {
  const tokenAddresses = contractAddresses[chain]?.[token];
  const isMBTC = tokenAddresses.btcToUsdDataFeed;

  const res = await sdk.api.abi.call({
    abi: dataFeedAbi.find((m) => m.name === 'getDataInBase18'),
    target: tokenAddresses.dataFeed,
    chain,
  });

  const price = res.output;

  if (isMBTC) {
    const res = await sdk.api.abi.call({
      abi: basicDataFeedAbi.find((m) => m.name === 'latestRoundData'),
      target: tokenAddresses.btcToUsdDataFeed,
      chain,
    });
    const btcToUsdRate = BigInt(res.output[1]) / BigInt(1e8);
    return btcToUsdRate * BigInt(price);
  } else {
    return BigInt(price);
  }
};

module.exports = fetchMTokenPrice;
