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

const getPoolBoostRateAbi = {
  "inputs": [],
  "name": "rewardRate",
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

const getBoostRewardTokenAbi = {
  "inputs": [],
  "name": "rewardToken",
  "outputs": [
    {
      "internalType": "address",
      "name": "",
      "type": "address"
    }
  ],
  "stateMutability": "view",
  "type": "function"
}

// Avalanche
const USDC_POOL_TUP_CONTRACT = '0x8027e004d80274FB320e9b8f882C92196d779CE8';
const USDT_POOL_TUP_CONTRACT = '0x1b6D7A6044fB68163D8E249Bce86F3eFbb12368e';
const WAVAX_POOL_TUP_CONTRACT = '0xaa39f39802F8C44e48d4cc42E088C09EDF4daad4';
const BTC_POOL_TUP_CONTRACT = '0x70e80001bDbeC5b9e932cEe2FEcC8F123c98F738';
const ETH_POOL_TUP_CONTRACT = '0x2A84c101F3d45610595050a622684d5412bdf510';

const WAVAX_TOKEN_ADDRESS = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const USDC_TOKEN_ADDRESS = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
const USDT_TOKEN_ADDRESS = '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7';
const BTC_TOKEN_ADDRESS = '0x152b9d0FdC40C096757F570A51E494bd4b943E50';
const ETH_TOKEN_ADDRESS = '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab';

const GGAVAX_TOKEN_ADDRESS = '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3';
const SAVAX_TOKEN_ADDRESS = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';

// Arbitrum
const USDC_POOL_TUP_ARBI_CONTRACT = '0x8Ac9Dc27a6174a1CC30873B367A60AcdFAb965cc';
const ETH_POOL_TUP_ARBI_CONTRACT = '0x788A8324943beb1a7A47B76959E6C1e6B87eD360';
const ARB_POOL_TUP_ARBI_CONTRACT = '0xC629E8889350F1BBBf6eD1955095C2198dDC41c2';
const BTC_POOL_TUP_ARBI_CONTRACT = '0x0ed7B42B74F039eda928E1AE6F44Eed5EF195Fb5';
const DAI_POOL_TUP_ARBI_CONTRACT = '0xFA354E4289db87bEB81034A3ABD6D465328378f1';

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
  const usdcPoolTvl = await getUsdcPoolTVL();
  const usdcPool = {
    pool: `dp-${USDC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: usdcPoolTvl,
    apyBase: await getUsdcPoolDepositRate(),
    underlyingTokens: [USDC_TOKEN_ADDRESS]
  };

  const usdtPoolTvl = await getUsdtPoolTVL();
  const usdtPool = {
    pool: `dp-${USDT_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDt'),
    tvlUsd: usdtPoolTvl,
    apyBase: await getUsdtPoolDepositRate(),
    underlyingTokens: [USDT_TOKEN_ADDRESS]
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
  };

  const btcPoolTvl = await getBtcPoolTVL();
  const btcPool = {
    pool: `dp-${BTC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('BTC.b'),
    tvlUsd: btcPoolTvl,
    apyBase: await getBtcPoolDepositRate(),
    underlyingTokens: [BTC_TOKEN_ADDRESS]
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
  };

  const ethPoolArbiTvl = await getEthPoolArbiTVL();
  const ethPoolArbi = {
    pool: `dp-${ETH_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WETH'),
    tvlUsd: ethPoolArbiTvl,
    apyBase: await getEthPoolArbiDepositRate(),
    underlyingTokens: [ETH_TOKEN_ARBI_ADDRESS],
  };

  const usdcPoolArbiTvl = await getUsdcPoolArbiTVL();
  const usdcPoolArbi = {
    pool: `dp-${USDC_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: usdcPoolArbiTvl,
    apyBase: await getUsdcPoolArbiDepositRate(),
    underlyingTokens: [USDC_TOKEN_ARBI_ADDRESS],
  };

  const arbPoolArbiTvl = await getArbPoolArbiTVL();
  const arbPoolArbi = {
    pool: `dp-${ARB_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('ARB'),
    tvlUsd: arbPoolArbiTvl,
    apyBase: await getArbPoolArbiDepositRate(),
    underlyingTokens: [ARB_TOKEN_ARBI_ADDRESS],
  };

  const btcPoolArbiTvl = await getBtcPoolArbiTVL();
  const btcPoolArbi = {
    pool: `dp-${BTC_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WBTC'),
    tvlUsd: btcPoolArbiTvl,
    apyBase: await getBtcPoolArbiDepositRate(),
    underlyingTokens: [BTC_TOKEN_ARBI_ADDRESS],
  };

  const daiPoolArbiTvl = await getDaiPoolArbiTVL();
  const daiPoolArbi = {
    pool: `dp-${DAI_TOKEN_ARBI_ADDRESS}-arbitrum`,
    chain: utils.formatChain('arbitrum'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('DAI'),
    tvlUsd: daiPoolArbiTvl,
    apyBase: await getDaiPoolArbiDepositRate(),
    underlyingTokens: [DAI_TOKEN_ARBI_ADDRESS],
  };




  return [usdcPool, usdtPool, wavaxPool, btcPool, ethPool,
    ethPoolArbi, usdcPoolArbi, arbPoolArbi, btcPoolArbi, daiPoolArbi
    ];
};

module.exports = {
  timetravel: false,
  start: 1673346953,
  apy: getPoolsAPYs,
  url: 'https://app.deltaprime.io/#/pools',
};
