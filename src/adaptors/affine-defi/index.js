const axios = require('axios');

const API_URL = 'https://api.affinedefi.com';

const SUPPORTED_CHAINS = {
  1: 'ethereum',
  137: 'polygon',
};

const getBasketsByChainId = async (chainId) => {
  const { data } = await axios.get(
    `${API_URL}/v2/getBasketMetadata?chainId=${chainId}`
  );
  return data;
};

const getApyByBasketTicker = async (basketTicker) => {
  const { data } = await axios.get(
    `${API_URL}/v2/getBasketHistoricalData?basketTicker=${basketTicker}&period=oneMonth`
  );

  // we will return the 24h APY from the first element of the 'historicalData' array
  if (data && data[basketTicker].historicalData.length > 0) {
    return data[basketTicker].historicalData[0].yieldPcnt ?? 0;
  }

  return 0;
};

const getTVLInUsdByBasketDenomination = async (
  ticker,
  basketDenomination,
  tvl
) => {
  // we won't do anything if the denomination is already in USD
  if (basketDenomination === '$') {
    return {
      ticker,
      tvlUsd: tvl ?? 0,
    };
  }
  const { data } = await axios.get(
    `${API_URL}/v2/token/getTokenConversion?sourceToken=${basketDenomination}&quantity=${tvl}`
  );

  if (data && data[basketDenomination]) {
    return {
      ticker,
      tvlUsd: data[basketDenomination],
    };
  }

  return {
    ticker,
    tvlUsd: tvl ?? 0,
  };
};

const getAllBasketApyByChain = async (chainId) => {
  const baskets = await getBasketsByChainId(chainId); // we will get objects as a response
  const apyPromises = Object.keys(baskets).map((basketTicker) =>
    getApyByBasketTicker(basketTicker)
  );

  const apy = await Promise.all(apyPromises);

  // we will convert the tvl to USD
  const tvlPromises = Object.keys(baskets).map((key) =>
    getTVLInUsdByBasketDenomination(
      key,
      baskets[key].denomination,
      baskets[key].tvl
    )
  );

  const tvls = await Promise.all(tvlPromises);

  return Object.keys(baskets).map((key, index) => {
    return {
      pool: `${baskets[key].basketAddress}-${SUPPORTED_CHAINS[chainId]}`,
      chain: SUPPORTED_CHAINS[chainId],
      project: 'affine-defi',
      symbol: key,
      tvlUsd: tvls.find((tvl) => tvl.ticker === key).tvlUsd,
      apy: apy[index],
      url: `https://app.affinedefi.com/basket?id=${key}`,
    };
  });
};

const main = async () => {
  // we will fetch the APY for all baskets based on 'SUPPORTED_CHAINS'
  const data = await Promise.all(
    Object.keys(SUPPORTED_CHAINS).map((chainId) =>
      getAllBasketApyByChain(chainId)
    )
  );

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
