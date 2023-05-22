const sdk = require('@defillama/sdk');
const utils = require('../utils');
const getPoolDepositRateAbi = {
  "inputs": [],
  "name": "getDepositRate",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}

const getPoolTotalSupplyAbi = {
  "inputs": [],
  "name": "totalSupply",
  "outputs": [
    {
      "internalType": "uint256",
      "name": "",
      "type": "uint256"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}

const USDC_POOL_TUP_CONTRACT = '0x2323dAC85C6Ab9bd6a8B5Fb75B0581E31232d12b';
const USDT_POOL_TUP_CONTRACT = '0xd222e10D7Fe6B7f9608F14A8B5Cf703c74eFBcA1';
const WAVAX_POOL_TUP_CONTRACT = '0xD26E504fc642B96751fD55D3E68AF295806542f5';
const BTC_POOL_TUP_CONTRACT = '0x475589b0Ed87591A893Df42EC6076d2499bB63d0';
const ETH_POOL_TUP_CONTRACT = '0xD7fEB276ba254cD9b34804A986CE9a8C3E359148';

const WAVAX_TOKEN_ADDRESS = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const USDC_TOKEN_ADDRESS = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
const USDT_TOKEN_ADDRESS = '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7';
const BTC_TOKEN_ADDRESS = '0x152b9d0FdC40C096757F570A51E494bd4b943E50';
const ETH_TOKEN_ADDRESS = '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab';

const getPoolTVL = async (poolAddress) => {
  return (await sdk.api.abi.call({
    abi: getPoolTotalSupplyAbi,
    chain: 'avax',
    target: poolAddress,
    params: [],
  })).output;
}

const getTokenPrice = async (tokenAddress, chain='avax') => {
  const data = await utils.getData(
    `https://coins.llama.fi/prices/current/${chain}:${tokenAddress}`
  );
  return data.coins[Object.keys(data.coins)[0]].price
}

const getPoolDepositRate = async (poolAddress) => {
  return (await sdk.api.abi.call({
    abi: getPoolDepositRateAbi,
    chain: 'avax',
    target: poolAddress,
    params: [],
  })).output;
}

const getBtcPoolDepositRate = async () => {
  return await getPoolDepositRate(BTC_POOL_TUP_CONTRACT) / 1e16;
}

const getEthPoolDepositRate = async () => {
  return await getPoolDepositRate(ETH_POOL_TUP_CONTRACT) / 1e16;
}

const getUsdcPoolDepositRate = async () => {
  return await getPoolDepositRate(USDC_POOL_TUP_CONTRACT) / 1e16;
}

const getUsdtPoolDepositRate = async () => {
  return await getPoolDepositRate(USDT_POOL_TUP_CONTRACT) / 1e16;
}

const getWavaxPoolDepositRate = async () => {
  return await getPoolDepositRate(WAVAX_POOL_TUP_CONTRACT) / 1e16;
}

const getBtcPoolTVL = async() => {
  const supply = await getPoolTVL(BTC_POOL_TUP_CONTRACT);

  const price = await getTokenPrice(BTC_TOKEN_ADDRESS);
  return supply * price / 1e8;
}

const getEthPoolTVL = async() => {
  const supply = await getPoolTVL(ETH_POOL_TUP_CONTRACT);

  const price = await getTokenPrice(ETH_TOKEN_ADDRESS);
  return supply * price / 1e18;
}

const getWavaxPoolTVL = async() => {
  const supply = await getPoolTVL(WAVAX_POOL_TUP_CONTRACT);

  const price = await getTokenPrice(WAVAX_TOKEN_ADDRESS);
  return supply * price / 1e18;
}

const getUsdcPoolTVL = async() => {
  const supply = await getPoolTVL(USDC_POOL_TUP_CONTRACT);
  const price = await getTokenPrice(USDC_TOKEN_ADDRESS);
  return supply * price / 1e6;
}

const getUsdtPoolTVL = async() => {
  const supply = await getPoolTVL(USDT_POOL_TUP_CONTRACT);
  const price = await getTokenPrice(USDT_TOKEN_ADDRESS);
  return supply * price / 1e6;
}

const getPoolsAPYs = async () => {
  const usdcPool = {
    pool: `${USDC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: await getUsdcPoolTVL(),
    apyBase: await getUsdcPoolDepositRate(),
    underlyingTokens: [USDC_TOKEN_ADDRESS],
    poolMeta: 'USDC lending pool',
  };

  const usdtPool = {
    pool: `${USDT_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDt'),
    tvlUsd: await getUsdtPoolTVL(),
    apyBase: await getUsdtPoolDepositRate(),
    underlyingTokens: [USDT_TOKEN_ADDRESS],
    poolMeta: 'USDt lending pool',
  };

  const wavaxPool = {
    pool: `${WAVAX_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WAVAX'),
    tvlUsd: await getWavaxPoolTVL(),
    apyBase: await getWavaxPoolDepositRate(),
    underlyingTokens: [WAVAX_TOKEN_ADDRESS],
    poolMeta: 'WAVAX lending pool',
  };

  const btcPool = {
    pool: `${BTC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('BTC.b'),
    tvlUsd: await getBtcPoolTVL(),
    apyBase: await getBtcPoolDepositRate(),
    underlyingTokens: [BTC_TOKEN_ADDRESS],
    poolMeta: 'BTC.b lending pool',
  };

  const ethPool = {
    pool: `${ETH_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WETH.e'),
    tvlUsd: await getEthPoolTVL(),
    apyBase: await getEthPoolDepositRate(),
    underlyingTokens: [ETH_TOKEN_ADDRESS],
    poolMeta: 'WETH.e lending pool',
  };

  return [usdcPool, usdtPool, wavaxPool, btcPool, ethPool];
};

module.exports = {
  timetravel: false,
  start: 1673346953,
  apy: getPoolsAPYs,
  url: 'https://app.deltaprime.io/#/pools',
};
