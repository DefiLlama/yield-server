const { api } = require('@defillama/sdk');
const axios = require('axios');
const ABI = require('./abi.json');

const API_URL = 'https://api.affinedefi.com';

const SUPPORTED_CHAINS = {
  1: 'ethereum',
  137: 'polygon',
};

const SECONDS_IN_DAY = 86400;

const getLatestBlock = async (chainId) => {
  return await api.util.getLatestBlock(SUPPORTED_CHAINS[chainId]);
};

/**
 * This will convert the output of the contract to a number
 */
const formatOutputToNumber = (output) => {
  const number = Number(output.num);
  const decimals = Number(output.decimals);

  return number / 10 ** decimals;
};

const getBasketsByChainId = async (chainId) => {
  const { data } = await axios.get(
    `${API_URL}/v2/getBasketMetadata?chainId=${chainId}`
  );
  return data;
};

const getTVLInUsdByBasketDenomination = async (
  ticker,
  basketDenomination,
  tvl,
  chainId
) => {
  if (basketDenomination === '$') {
    // case - the denomination is already in USD, we don't need to convert it
    return {
      ticker,
      tvlUsd: tvl ?? 0,
    };
  }
  const { data } = await axios.get(
    `https://coins.llama.fi/prices/current/coingecko:${SUPPORTED_CHAINS[chainId]}`
  );

  if (
    data &&
    data.coins &&
    data.coins[`coingecko:${SUPPORTED_CHAINS[chainId]}`] &&
    data.coins[`coingecko:${SUPPORTED_CHAINS[chainId]}`].price
  ) {
    return {
      ticker,
      tvlUsd:
        tvl *
        Number(data.coins[`coingecko:${SUPPORTED_CHAINS[chainId]}`].price),
    };
  }

  return {
    ticker,
    tvlUsd: tvl ?? 0,
  };
};

const getTVLFromChain = async (baskets, chainId) => {
  // we are going to find the address in the addressbook

  const latestBlock = await getLatestBlock(chainId);
  const abi = ABI.find((abi) => abi.name === 'detailedTVL');

  const value = await api.abi.multiCall({
    abi,
    calls: baskets.map((basket) => ({
      target: basket.basketAddress,
    })),
    chain: SUPPORTED_CHAINS[chainId],
    block: latestBlock.number,
  });

  const TVLsInUSDPromises = value.output.map((output, index) =>
    getTVLInUsdByBasketDenomination(
      baskets[index].basketTicker,
      baskets[index].denomination,
      formatOutputToNumber(output.output),
      chainId
    )
  );

  return await Promise.all(TVLsInUSDPromises);
};

const getAPYFromChainByBasket = async (
  baskets,
  chainId,
  isSevenDay = false
) => {
  const latestBlock = await getLatestBlock(chainId);
  const oneDayOldBlock = await api.util.lookupBlock(
    latestBlock.timestamp - SECONDS_IN_DAY,
    {
      chain: SUPPORTED_CHAINS[chainId],
    }
  );
  const sevenDayOldBlock = await api.util.lookupBlock(
    latestBlock.timestamp - SECONDS_IN_DAY * 7,
    {
      chain: SUPPORTED_CHAINS[chainId],
    }
  );

  const abi = ABI.find((abi) => abi.name === 'detailedPrice');

  const currentPrice = await api.abi.multiCall({
    abi,
    calls: baskets.map((basket) => ({
      target: basket.basketAddress,
    })),
    chain: SUPPORTED_CHAINS[chainId],
    block: latestBlock.block,
  });
  const oldPrice = await api.abi.multiCall({
    abi,
    calls: baskets.map((basket) => ({
      target: basket.basketAddress,
    })),
    chain: SUPPORTED_CHAINS[chainId],
    block: isSevenDay ? sevenDayOldBlock.block : oneDayOldBlock.block,
  });
  let APYs = [];
  const multiplyr = isSevenDay ? 36500 / 7 : 36500;

  currentPrice.output.forEach((price, index) => {
    let apy = 0;
    if (oldPrice.output[index].output != null) {
      apy =
        (formatOutputToNumber(price.output) /
          formatOutputToNumber(oldPrice.output[index].output) -
          1) *
        multiplyr;
    }
    APYs.push({
      ticker: baskets[index].basketTicker,
      apy,
    });
  });

  return APYs;
};

const assetAbi = {
  inputs: [],
  name: 'asset',
  outputs: [
    { internalType: 'address', name: 'assetTokenAddress', type: 'address' },
  ],
  stateMutability: 'view',
  type: 'function',
};

const getAllBasketApyByChain = async (chainId) => {
  const baskets = await getBasketsByChainId(chainId); // we will get objects as a response

  // filtering out the BtcEthVault vault due to no yield
  delete baskets['BtcEthVault'];
  const basketsArr = Object.keys(baskets).map((key) => baskets[key]);
  const apys = await getAPYFromChainByBasket(basketsArr, chainId);
  const sevenDayAPYs = await getAPYFromChainByBasket(basketsArr, chainId, true);
  const tvls = await getTVLFromChain(basketsArr, chainId);

  const pools = await Promise.all(
    Object.keys(baskets).map(async (key, index) => {
      const { output: underlying } = await api.abi.call({
        target: baskets[key].basketAddress,
        chain: SUPPORTED_CHAINS[chainId],
        abi: assetAbi,
      });

      return {
        pool: `${baskets[key].basketAddress}-${SUPPORTED_CHAINS[chainId]}`,
        chain: SUPPORTED_CHAINS[chainId],
        project: 'affine-defi-earn',
        symbol:
          baskets[key].denomination === '$'
            ? 'USDC'
            : baskets[key].denomination,
        tvlUsd: tvls.find((tvl) => tvl.ticker === key).tvlUsd,
        apyBase: apys.find((apy) => apy.ticker === key).apy,
        apyBase7d: sevenDayAPYs.find((apy) => apy.ticker === key).apy,
        poolMeta: baskets[key].basketName,
        underlyingTokens: [underlying],
      };
    })
  );
  return pools.flat();
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
  url: 'https://app.affinedefi.com/',
};
