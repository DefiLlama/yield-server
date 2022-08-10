const axios = require('axios');
const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const getCoreConfig = async () => {
  const {
    data: { bridges },
  } = await axios.get(
    'https://assets.hop.exchange/mainnet/v1-core-config.json'
  );

  return bridges;
};

const getPoolTokenBalances = async (coreConfig, chain, token) => {
  const config = coreConfig[token][chain];
  const poolAddress = config.l2SaddleSwap;
  const tokenAddress = config.l2CanonicalToken;
  const hopTokenAddress = config.l2HopBridgeToken;
  const adaptedChain = getAdaptedChain(chain);

  const [tokenBalance, hopTokenBalance, decimals] = await Promise.all(
    [
      sdk.api.abi.call({
        abi: 'erc20:balanceOf',
        chain: adaptedChain,
        target: tokenAddress,
        params: [poolAddress],
      }),
      sdk.api.abi.call({
        abi: 'erc20:balanceOf',
        chain: adaptedChain,
        target: hopTokenAddress,
        params: [poolAddress],
      }),
      sdk.api.abi.call({
        abi: 'erc20:decimals',
        chain: adaptedChain,
        target: tokenAddress,
        params: [],
      }),
    ].map((promise) => promise.then((data) => data.output))
  );

  return { tokenBalance, hopTokenBalance, decimals, tokenAddress };
};

const getPoolTvl = async (coreConfig, chain, token) => {
  const adaptedChain = getAdaptedChain(chain);

  const { tokenBalance, hopTokenBalance, decimals, tokenAddress } =
    await getPoolTokenBalances(coreConfig, chain, token);
  const key = `${adaptedChain}:${tokenAddress}`;
  const {
    data: { coins },
  } = await axios.post('https://coins.llama.fi/prices', {
    coins: [key],
  });
  const price = coins[key.toLowerCase()].price;

  const totalBalance = new BigNumber(tokenBalance)
    .plus(new BigNumber(hopTokenBalance))
    .div(new BigNumber(10 ** decimals));
  const totalValue = totalBalance.multipliedBy(price);
  return totalValue.toNumber();
};

const getAdaptedChain = (chain) => {
  switch (chain) {
    case 'gnosis':
      return 'xdai';
    default:
      return chain;
  }
};

const main = async () => {
  const {
    data: { data },
  } = await axios.get('https://assets.hop.exchange/v1-pool-stats.json');

  const tokens = Object.keys(data);
  const coreConfig = await getCoreConfig();

  const promises = tokens
    .map((token) => {
      const tokenPools = data[token];
      const chains = Object.keys(data[token]);
      return chains.map(async (chain) => {
        const tvlUsd = await getPoolTvl(coreConfig, chain, token);
        const tokenAddress = coreConfig[token][chain].l2CanonicalToken;
        const hopTokenAddress = coreConfig[token][chain].l2HopBridgeToken;
        const adaptedChain = getAdaptedChain(chain);

        const apyReward = tokenPools[chain].stakingApr * 100;

        return {
          pool: `${chain}-${token}`,
          chain: utils.formatChain(adaptedChain),
          project: 'hop-protocol',
          symbol: token,
          apyBase: tokenPools[chain].apr * 100,
          apyReward,
          rewardTokens:
            adaptedChain === 'polygon' && apyReward > 0
              ? ['0x0d500b1d8e8ef31e21c99d1db9a6444d3adf1270'] // wmatic
              : [],
          underlyingTokens: [tokenAddress, hopTokenAddress],
          tvlUsd,
        };
      });
    })
    .flat();

  const pools = await Promise.all(promises);
  return pools.filter((pool) => !!pool.apyBase);
};

module.exports = {
  timetravel: false,
  apy: main,
};
