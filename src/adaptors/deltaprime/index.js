const sdk = require('@defillama/sdk');
const fetch = require('node-fetch')

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

// Avalanche
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

// Arbitrum
const USDC_POOL_TUP_ARBI_CONTRACT = '0x8FE3842e0B7472a57f2A2D56cF6bCe08517A1De0';
const ETH_POOL_TUP_ARBI_CONTRACT = '0x0BeBEB5679115f143772CfD97359BBcc393d46b3';
const ARB_POOL_TUP_ARBI_CONTRACT = '0x2B8C610F3fC6F883817637d15514293565C3d08A';
const BTC_POOL_TUP_ARBI_CONTRACT = '0x5CdE36c23f0909960BA4D6E8713257C6191f8C35';
const DAI_POOL_TUP_ARBI_CONTRACT = '0xd5E8f691756c3d7b86FD8A89A06497D38D362540';

const USDC_TOKEN_ARBI_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const ETH_TOKEN_ARBI_ADDRESS = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
const ARB_TOKEN_ARBI_ADDRESS = '0x912CE59144191C1204E64559FE8253a0e49E6548';
const BTC_TOKEN_ARBI_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const DAI_TOKEN_ARBI_ADDRESS = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';

const getPoolTVL = async (poolAddress, chain = 'avax') => {
  return (await sdk.api.abi.call({
    abi: getPoolTotalSupplyAbi,
    chain: chain,
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

const getPoolDepositRate = async (poolAddress, chain = 'avax') => {
  return (await sdk.api.abi.call({
    abi: getPoolDepositRateAbi,
    chain: chain,
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

const getUsdcPoolArbiDepositRate = async () => {
  return await getPoolDepositRate(USDC_POOL_TUP_ARBI_CONTRACT, 'arbitrum') / 1e16;
}

const getEthPoolArbiDepositRate = async () => {
  return await getPoolDepositRate(ETH_POOL_TUP_ARBI_CONTRACT, 'arbitrum') / 1e16;
}

const getArbPoolArbiDepositRate = async () => {
  return await getPoolDepositRate(ARB_POOL_TUP_ARBI_CONTRACT, 'arbitrum') / 1e16;
}

const getBtcPoolArbiDepositRate = async () => {
  return await getPoolDepositRate(BTC_POOL_TUP_ARBI_CONTRACT, 'arbitrum') / 1e16;
}

const getDaiPoolArbiDepositRate = async () => {
  return await getPoolDepositRate(DAI_POOL_TUP_ARBI_CONTRACT, 'arbitrum') / 1e16;
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

const getEthPoolArbiTVL = async() => {
  const supply = await getPoolTVL(ETH_POOL_TUP_ARBI_CONTRACT, 'arbitrum');

  const price = await getTokenPrice(ETH_TOKEN_ARBI_ADDRESS, 'arbitrum');
  return supply * price / 1e18;
}

const getArbPoolArbiTVL = async() => {
  const supply = await getPoolTVL(ARB_POOL_TUP_ARBI_CONTRACT, 'arbitrum');

  const price = await getTokenPrice(ARB_TOKEN_ARBI_ADDRESS, 'arbitrum');
  return supply * price / 1e18;
}

const getBtcPoolArbiTVL = async() => {
  const supply = await getPoolTVL(BTC_POOL_TUP_ARBI_CONTRACT, 'arbitrum');

  const price = await getTokenPrice(BTC_TOKEN_ARBI_ADDRESS, 'arbitrum');
  return supply * price / 1e8;
}


const getDaiPoolArbiTVL = async() => {
  const supply = await getPoolTVL(DAI_POOL_TUP_ARBI_CONTRACT, 'arbitrum');

  const price = await getTokenPrice(DAI_TOKEN_ARBI_ADDRESS, 'arbitrum');
  return supply * price / 1e18;
}

const getUsdcPoolArbiTVL = async() => {
  const supply = await getPoolTVL(USDC_POOL_TUP_ARBI_CONTRACT, 'arbitrum');

  const price = await getTokenPrice(USDC_TOKEN_ARBI_ADDRESS, 'arbitrum');
  return supply * price / 1e6;
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
  let rewardAPRs = await fetch('https://2t8c1g5jra.execute-api.us-east-1.amazonaws.com/ltip-pool-boost-apy');
  rewardAPRs = await rewardAPRs.json();

  const usdcPoolTvl = await getUsdcPoolTVL();
  const usdcPool = {
    pool: `dp-${USDC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: usdcPoolTvl,
    apyBase: await getUsdcPoolDepositRate(),
    underlyingTokens: [USDC_TOKEN_ADDRESS],
    rewardTokens: [USDC_TOKEN_ADDRESS],
  };

  const usdtPoolTvl = await getUsdtPoolTVL();
  const usdtPool = {
    pool: `dp-${USDT_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDt'),
    tvlUsd: usdtPoolTvl,
    apyBase: await getUsdtPoolDepositRate(),
    underlyingTokens: [USDT_TOKEN_ADDRESS],
    rewardTokens: [USDT_TOKEN_ADDRESS],
  };

  const wavaxPoolTvl = await getWavaxPoolTVL();
  const wavaxPool = {
    pool: `dp-${WAVAX_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WAVAX'),
    tvlUsd: wavaxPoolTvl,
    apyBase: await getWavaxPoolDepositRate(),
    underlyingTokens: [WAVAX_TOKEN_ADDRESS],
    rewardTokens: [WAVAX_TOKEN_ADDRESS],
  };

  const btcPoolTvl = await getBtcPoolTVL();
  const btcPool = {
    pool: `dp-${BTC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('BTC.b'),
    tvlUsd: btcPoolTvl,
    apyBase: await getBtcPoolDepositRate(),
    underlyingTokens: [BTC_TOKEN_ADDRESS],
    rewardTokens: [BTC_TOKEN_ADDRESS],
  };

  const ethPoolTvl = await getEthPoolTVL();
  const ethPool = {
    pool: `dp-${ETH_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WETH.e'),
    tvlUsd: ethPoolTvl,
    apyBase: await getEthPoolDepositRate(),
    underlyingTokens: [ETH_TOKEN_ADDRESS],
    rewardTokens: [ETH_TOKEN_ADDRESS],
  };

  const ethPoolArbiTvl = await getEthPoolArbiTVL();
  const ethPoolArbi = {
    pool: `dp-${ETH_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WETH'),
    tvlUsd: ethPoolArbiTvl,
    apyBase: await getEthPoolArbiDepositRate(),
    apyReward: rewardAPRs["ETH"]*100,
    underlyingTokens: [ETH_TOKEN_ARBI_ADDRESS],
    rewardTokens: [ETH_TOKEN_ARBI_ADDRESS, ARB_TOKEN_ARBI_ADDRESS],
  };

  const usdcPoolArbiTvl = await getUsdcPoolArbiTVL();
  const usdcPoolArbi = {
    pool: `dp-${USDC_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: usdcPoolArbiTvl,
    apyBase: await getUsdcPoolArbiDepositRate(),
    apyReward: rewardAPRs["USDC"]*100,
    underlyingTokens: [USDC_TOKEN_ARBI_ADDRESS],
    rewardTokens: [USDC_TOKEN_ARBI_ADDRESS, ARB_TOKEN_ARBI_ADDRESS],
  };

  const arbPoolArbiTvl = await getArbPoolArbiTVL();
  const arbPoolArbi = {
    pool: `dp-${ARB_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('ARB'),
    tvlUsd: arbPoolArbiTvl,
    apyBase: await getArbPoolArbiDepositRate(),
    apyReward: rewardAPRs["ARB"]*100,
    underlyingTokens: [ARB_TOKEN_ARBI_ADDRESS],
    rewardTokens: [ARB_TOKEN_ARBI_ADDRESS, ARB_TOKEN_ARBI_ADDRESS],
  };

  const btcPoolArbiTvl = await getBtcPoolArbiTVL();
  const btcPoolArbi = {
    pool: `dp-${BTC_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WBTC'),
    tvlUsd: btcPoolArbiTvl,
    apyBase: await getBtcPoolArbiDepositRate(),
    apyReward: rewardAPRs["BTC"]*100,
    underlyingTokens: [BTC_TOKEN_ARBI_ADDRESS],
    rewardTokens: [BTC_TOKEN_ARBI_ADDRESS, ARB_TOKEN_ARBI_ADDRESS],
  };

  const daiPoolArbiTvl = await getDaiPoolArbiTVL();
  const daiPoolArbi = {
    pool: `dp-${DAI_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('DAI'),
    tvlUsd: daiPoolArbiTvl,
    apyBase: await getDaiPoolArbiDepositRate(),
    apyReward: rewardAPRs["DAI"]*100,
    underlyingTokens: [DAI_TOKEN_ARBI_ADDRESS],
    rewardTokens: [DAI_TOKEN_ARBI_ADDRESS, ARB_TOKEN_ARBI_ADDRESS],
  };




  return [usdcPool, usdtPool, wavaxPool, btcPool, ethPool, ethPoolArbi, usdcPoolArbi, arbPoolArbi, btcPoolArbi, daiPoolArbi];
};

module.exports = {
  timetravel: false,
  start: 1673346953,
  apy: getPoolsAPYs,
  url: 'https://app.deltaprime.io/#/pools',
};
