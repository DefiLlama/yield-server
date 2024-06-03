const axios = require('axios');
const sdk = require('@defillama/sdk');

const abi = require('./abis/abi.json');
const erc20Abi = require('./abis/erc20.abi.json');
const stableAbi = require('./abis/stable.abi.json');
const { getProvider } = require('@defillama/sdk');

const BASE_URL = 'https://api.interport.fi';
const STABLECOIN_URL = 'https://app.interport.fi/stablecoin-pools';

const CHAINS = {
  1: 'Ethereum',
  250: 'Fantom',
  81457: 'Blast',
  59144: 'Linea',
  169: 'Manta',
  // 2525: 'inEVM',
};

const ITP_ADDRESS = '0x2b1D36f5B61AdDAf7DA7ebbd11B35FD8cfb0DE31';
const STABLE_ADDRESS = '0x29d44c17f4f83b3c77ae2eac4bc1468a496e3196';
const PROJECT_NAME = 'interport-finance';

const STABLECOIN_FARM_TYPE_LIST = {
  250: {
    '0xb6AB8EeFAE1a2c22Ca6338E143cb7dE544800c6e': 0,
  },
  1: {
    '0xEc8DDCb498b44C35EFaD7e5e43E0Caf6D16A66E8': 0,
    '0x5b45B414c6CD2a3341bE70Ba22BE786b0124003F': 1,
  },
  81457: {
    '0x5b45B414c6CD2a3341bE70Ba22BE786b0124003F': 0,
  },
  59144: {
    '0xEc8DDCb498b44C35EFaD7e5e43E0Caf6D16A66E8': 0,
    '0x5b45B414c6CD2a3341bE70Ba22BE786b0124003F': 1,
  },
  169: {
    '0xEc8DDCb498b44C35EFaD7e5e43E0Caf6D16A66E8': 0,
    '0x5b45B414c6CD2a3341bE70Ba22BE786b0124003F': 1,
  },
  // 2525: {
  //   '0xEc8DDCb498b44C35EFaD7e5e43E0Caf6D16A66E8': 0,
  //   '0x5b45B414c6CD2a3341bE70Ba22BE786b0124003F': 1,
  // },
};

const formatNumber = (n, decimals) => {
  return n / 10 ** decimals;
};

const getAPY = async () => {
  const promises = Object.keys(STABLECOIN_FARM_TYPE_LIST).map((chainId) => {
    return Object.keys(STABLECOIN_FARM_TYPE_LIST[chainId]).map((address) => {
      return getData({
        chainId: Number(chainId),
        address,
      });
    });
  });

  return await Promise.all(promises.flat());
};

const getData = async ({ chainId, address }) => {
  const calls = [];
  const chain = CHAINS[chainId].toLowerCase();

  const symbol = await sdk.api.abi.call({
    target: address,
    abi: erc20Abi.find(({ name }) => name === 'symbol'),
    chain,
  });

  const decimals = await sdk.api.abi.call({
    target: address,
    abi: erc20Abi.find(({ name }) => name === 'decimals'),
    chain,
  });

  calls.push(
    sdk.api.abi.call({
      target: address,
      abi: abi.find(({ name }) => name === 'balanceOf'),
      params: [STABLE_ADDRESS],
      chain,
    })
  );

  calls.push(
    sdk.api.abi.call({
      target: STABLE_ADDRESS,
      abi: stableAbi.find(({ name }) => name === 'rewardTokenPerSecond'),
      chain,
    })
  );

  calls.push(
    sdk.api.abi.call({
      target: STABLE_ADDRESS,
      abi: stableAbi.find(({ name }) => name === 'totalAllocationPoint'),
      chain,
    })
  );

  calls.push(
    sdk.api.abi.call({
      target: STABLE_ADDRESS,
      abi: stableAbi.find(({ name }) => name === 'poolInfo'),
      params: [STABLECOIN_FARM_TYPE_LIST[chainId][address]],
      chain,
    })
  );

  const [
    tvlResponse,
    itpPerSecondResponse,
    totalAllocationPointResponse,
    poolInfoResponse,
  ] = await Promise.all(calls);

  const tvl = formatNumber(tvlResponse.output, decimals.output);

  const { data } = await axios.get(
    `${BASE_URL}/utils/get-interport-token-info`
  );
  const itpPrice = data.price;
  const itpPerSecond = itpPerSecondResponse.output / 1e18;
  const itpPerYear = itpPerSecond * 60 * 60 * 24 * 365;

  const totalAllocationPoint = Number(totalAllocationPointResponse.output);
  const {
    stakingToken,
    stakingTokenTotalAmount,
    accumulatedRewardTokenPerShare,
    lastRewardTime,
    allocationPoint,
  } = poolInfoResponse.output;

  const totalInUSD = formatNumber(stakingTokenTotalAmount, decimals.output);
  const totalUSDPerPeriod =
    ((itpPerYear * itpPrice) / totalAllocationPoint) * Number(allocationPoint);

  const apr = (totalUSDPerPeriod * 100) / totalInUSD;

  return {
    chain: CHAINS[chainId],
    project: PROJECT_NAME,
    pool: `${chainId}-${address}`,
    symbol: symbol.output.replace('i', ''),
    apyBase: Number(apr),
    tvlUsd: Number(tvl),
  };
};

module.exports = {
  apy: getAPY,
  url: STABLECOIN_URL,
};
