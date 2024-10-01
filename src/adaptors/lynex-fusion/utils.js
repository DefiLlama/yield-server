const axios = require('axios');
const sdk = require('@defillama/sdk');
const gaugeAbi = require('./abis/gaugeABI.json')
const pairAPI = require('./abis/pairAPI.json');
const BigNumber = require('bignumber.js');
const _ = require('lodash');
const TEST_ACCOUNT = '0x1111110000000000000000000000000000000000'
const DEXSCREENER_ENDPOINT = 'https://api.dexscreener.com/latest/dex/tokens/';
const DEFILLAMA_ENDPOINT = 'https://coins.llama.fi/prices/current/';
const lynxAddress = '0x1a51b19ce03dbe0cb44c1528e34a7edd7771e9af';
const olynxAddress = '0x63349ba5e1f71252ecd56e8f950d1a518b400b60'
const btcs = ['0x5ffce65a40f6d3de5332766fff6a28bf491c868c', '0xe4d584ae9b753e549cae66200a6475d2f00705f7'];
const PROBLEM_POOLS = { '0x8dabf94c7bdd771e448a4ae4794cd71f9f3d7a0d': 0 };
const strategyUrl = 'https://raw.githubusercontent.com/Lynexfi/lynex-lists/main/config/strategies.json'

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
    console.log(`Defillama api error: ${address} ${error}`);
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
    console.log(`Dexscreener api error: ${address} ${error}`);
    return 0;
  }
};

const getTokenPrice = async (address) => {
  if (lynxAddress.toLowerCase().includes(address.toLowerCase())) {
    return getDexScreenerPrice(address);
  }
  if (btcs.includes(address.toLowerCase())) {
    const price = await getDexScreenerPrice(
      '0x3aab2285ddcddad8edf438c1bab47e1a9d05a9b4'
    );
    if (price) return price;
  }
  let price = await getDefillamaPrice(address);
  if (price === 0) {
    price = await getDexScreenerPrice(address);
  }
  return price;
};

const getPrices = async (addresses) => {
  const prices = new Map();
  await Promise.all(addresses.map(async (address) => {
    if (!prices.has(address)) {
      const price = await getTokenPrice(address);
      prices.set(address, price);
    }
  }));
  return prices;
};

const fetchExtraPoolRewards = async (pools) => {
  const filteredPools = pools.filter(pool => pool.gaugeAddress !== '0x0000000000000000000000000000000000000000');
  const rewardRateCalls = [];
  const periodCalls = [];

  filteredPools.forEach((pool) => {
    const extraRewardTokenAddresses = EXTRA_REWARDTOKENS[pool.gaugeAddress.toLowerCase()];
    if (extraRewardTokenAddresses) {
      extraRewardTokenAddresses.forEach((tokenAddress) => {
        rewardRateCalls.push({
          target: pool.gaugeAddress,
          params: [tokenAddress],
        });
        periodCalls.push({
          target: pool.gaugeAddress,
          params: [tokenAddress],
        });
      });
    }
  });

  const rew = await sdk.api.abi.multiCall({ abi: gaugeAbi.find((m) => m.name === 'rewardRate'), calls: rewardRateCalls, chain: 'linea' });
  const per = await sdk.api.abi.multiCall({ abi: gaugeAbi.find((m) => m.name === 'periodFinish'), calls: periodCalls, chain: 'linea' });
  const rewards = rew.output.map((res) => { return res.output })
  const periods = per.output.map((res) => { return res.output })

  let index = 0;
  const currentTimeStamp = Math.round(new Date().getTime() / 1000);
  const result = pools
    .map((pool) => {
      const processResult = [];
      const extraRewardTokenAddresses = EXTRA_REWARDTOKENS[pool.gaugeAddress.toLowerCase()];
      if (pool.gaugeAddress !== '0x0000000000000000000000000000000000000000' && extraRewardTokenAddresses) {
        extraRewardTokenAddresses.forEach((tokenAddress) => {
          const isFinished =
            Number(periods[index]) < currentTimeStamp;
          processResult.push({
            isFinished,
            rewardRate: rewards[index],
            tokenAddress,
            periodFinishes: periods[index],
          });
          index += 1;
        });
      }
      return processResult;
    });
  return result;
};

const fetchPeriodFinish = async (pools) => {
  const calls = pools
    .filter(pool => pool.gaugeAddress !== '0x0000000000000000000000000000000000000000')
    .map(pool => ({
      target: pool.gaugeAddress,
      params: [olynxAddress],
    }));
  const res = await sdk.api.abi.multiCall({ abi: gaugeAbi.find((m) => m.name === 'periodFinish'), calls, chain: 'linea' });
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

const fromWei = (number, decimals = 18) => new BigNumber(number).div(new BigNumber(10).pow(decimals));

const loadActiveStrategies = async () => {
  let activeStrategies = []
  try {
    const res = await axios.get(strategyUrl)
    activeStrategies = res.data['59144'];
    const validPools = activeStrategies.filter(
      (strat) => PROBLEM_POOLS[strat.address] === undefined,
    );
    activeStrategies = validPools;
  } catch (e) {
    console.log('Error processing strategies', e);
  }
  return activeStrategies;
}

const fetchGammaInfo = async (activeStrategies) => {
  const calls = activeStrategies
    .map((pool) => ({
      target: '0x6c84329CC8c37376eb32db50a17F3bFc917c3665',
      name: 'getPair',
      params: [pool.address, TEST_ACCOUNT],
    }));
  const res = await sdk.api.abi.multiCall({ abi: pairAPI.find((m) => m.name === 'getPair'), calls, chain: 'linea' });

  const processedData = res.output.map(({ output }) => {
    return {
      pair_address: output[0],
      symbol: output[1],
      name: output[2],
      decimals: output[3],
      stable: output[4],
      total_supply: output[5],
      token0: output[6],
      token0_symbol: output[7],
      token0_decimals: output[8],
      reserve0: output[9],
      claimable0: output[10],
      token1: output[11],
      token1_symbol: output[12],
      token1_decimals: output[13],
      reserve1: output[14],
      claimable1: output[15],
      gauge: output[16],
      gauge_total_supply: output[17],
      fee: output[18],
      bribe: output[19],
      emissions: output[20],
      emissions_token: output[21],
      emissions_token_decimals: output[22],
      account_lp_balance: output[23],
      account_token0_balance: output[24],
      account_token1_balance: output[25],
      account_gauge_balance: output[26],
      account_gauge_earned: output[27]
    };
  });
  return processedData;
}

module.exports = {
  getPrices,
  getTokenPrice,
  fetchExtraPoolRewards,
  fetchPeriodFinish,
  fromWei,
  loadActiveStrategies,
  fetchGammaInfo,
};