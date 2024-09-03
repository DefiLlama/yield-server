const axios = require('axios');
const sdk = require('@defillama/sdk');
const gaugeAbi = require('./abis/gaugeABI.json')

const DEXSCREENER_ENDPOINT = 'https://api.dexscreener.com/latest/dex/tokens/';
const DEFILLAMA_ENDPOINT = 'https://coins.llama.fi/prices/current/';
const lynxAddress = '0x1a51b19ce03dbe0cb44c1528e34a7edd7771e9af';
const btcs = ['0x5ffce65a40f6d3de5332766fff6a28bf491c868c', '0xe4d584ae9b753e549cae66200a6475d2f00705f7'];

const EXTRA_REWARDTOKENS = {
  '0x96b7062cfd1af7e4de5ef513ce66015e9ee6a991': ['0x5fbdf89403270a1846f5ae7d113a989f850d1566', '0x43e8809ea748eff3204ee01f08872f063e44065f', '0x78354f8dccb269a615a7e0a24f9b0718fdc3c7a7'],
  '0x72125a1c4a6e663c5e4da0bbfff9ae02b5ef727a': ['0x5fbdf89403270a1846f5ae7d113a989f850d1566', '0x43e8809ea748eff3204ee01f08872f063e44065f', '0x78354f8dccb269a615a7e0a24f9b0718fdc3c7a7'],
  '0x68672d332d246508b519defa1beac74e2d2f00b5': ['0x5fbdf89403270a1846f5ae7d113a989f850d1566', '0x43e8809ea748eff3204ee01f08872f063e44065f', '0x78354f8dccb269a615a7e0a24f9b0718fdc3c7a7'],
  '0x0cc0439c04760db602ee7ca2cbb4372ba4d28476': ['0x5fbdf89403270a1846f5ae7d113a989f850d1566', '0x43e8809ea748eff3204ee01f08872f063e44065f', '0x78354f8dccb269a615a7e0a24f9b0718fdc3c7a7'],
  '0x14af0979e96dea94ad2466dfdf11e85886ce04f9': ['0x5fbdf89403270a1846f5ae7d113a989f850d1566', '0x43e8809ea748eff3204ee01f08872f063e44065f', '0x78354f8dccb269a615a7e0a24f9b0718fdc3c7a7'],
};

const getDefillamaPrice = async (address) => {
  try {
    const chainToken = `linea:${address}`;
    const res = await axios.get(DEFILLAMA_ENDPOINT + chainToken);
    const items = Object.values(res.data.coins);
    if (items.length > 0) {
      return items[0].price;
    }
    return 0;
  } catch (error) {
    logger.error(`Defillama api error: ${error}`);
    return 0;
  }
};

const getDexScreenerPrice = async (address) => {
  try {
    const queryUrl = DEXSCREENER_ENDPOINT + address;
    const res = await axios.get(queryUrl);
    if (res.data.pairs && res.data.pairs.length > 0) {
      const found = res.data.pairs.find(
        pair => pair.baseToken.address.toLowerCase() === address
      );
      if (found) {
        return Number(found.priceUsd);
      }
    }
    return 0;
  } catch (error) {
    logger.error(`Dexscreener api error: ${error}`);
    return 0;
  }
};

const getTokenPrice = async (asset) => {
  if (lynxAddress.toLowerCase().includes(asset.address.toLowerCase())) {
    return getDexScreenerPrice(asset.address);
  }
  if (btcs.includes(asset.address.toLowerCase())) {
    const price = await getDexScreenerPrice(
      '0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4'
    );
    if (price) return price;
  }
  let price = await getDefillamaPrice(asset.address);
  if (price === 0) {
    price = await getDexScreenerPrice(asset.address);
  }
  return price;
};

const fetchExtraPoolRewards = async (pools) => {
  const filteredPools = pools.filter(pool => pool.gaugeAddress !== '0x0000000000000000000000000000000000000000');
  const calls = [];

  filteredPools.forEach((pool) => {
    const extraRewardTokenAddresses = EXTRA_REWARDTOKENS[pool.gaugeAddress.toLowerCase()];
    if (extraRewardTokenAddresses) {
      extraRewardTokenAddresses.forEach((tokenAddress) => {
        calls.push({
          address: pool.gaugeAddress,
          name: 'rewardRate',
          params: [tokenAddress],
        });
        calls.push({
          address: pool.gaugeAddress,
          name: 'periodFinish',
          params: [tokenAddress],
        });
      });
    }
  });

  const multiCallResponse = await sdk.api.abi.multicall({ abi: gaugeAbi, calls, chain: 'linea' });

  let index = 0;
  const currentTimeStamp = Math.round(new Date().getTime() / 1000);
  const result = pools
    .map((pool) => {
      const processResult = [];
      const extraRewardTokenAddresses = EXTRA_REWARDTOKENS[pool.gaugeAddress.toLowerCase()];
      if (pool.gaugeAddress !== '0x0000000000000000000000000000000000000000' && extraRewardTokenAddresses) {
        extraRewardTokenAddresses.forEach((tokenAddress) => {
          const periodFinish = multiCallResponse[index + 1][0].toNumber();
          const isFinished = periodFinish < currentTimeStamp;
          processResult.push(
            {
              isFinished,
              rewardRate: multiCallResponse[index][0],
              tokenAddress,
              periodFinishes: multiCallResponse[index + 1][0],
              periodFinish
            }
          );
          index += 2;
        });
      }
      return processResult;
    });

  return { multiCallResponse, result };
};

const fetchPeriodFinish = async (pools) => {
  const calls = pools
    .filter(pool => pool.gaugeAddress !== '0x0000000000000000000000000000000000000000')
    .map(pool => ({
      address: pool.gaugeAddress,
      name: 'periodFinish',
      params: [config.contracts.oLynxAddress],
    }));

  const res = await multicall({ abi: gaugeAbi, calls, chain: 'linea' });
  let index = 0;
  const currentTimeStamp = new Date().getTime() / 1000;
  return pools
    .map((pool) => {
      if (pool.gaugeAddress !== '0x0000000000000000000000000000000000000000') {
        const isFinished = res[index] < currentTimeStamp;
        index += 1;
        return isFinished;
      }
      return true;
    });
};