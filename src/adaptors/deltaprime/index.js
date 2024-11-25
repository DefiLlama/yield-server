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
const USDC_POOL_TUP_CONTRACT = '0x2323dAC85C6Ab9bd6a8B5Fb75B0581E31232d12b';
const USDT_POOL_TUP_CONTRACT = '0xd222e10D7Fe6B7f9608F14A8B5Cf703c74eFBcA1';
const WAVAX_POOL_TUP_CONTRACT = '0xD26E504fc642B96751fD55D3E68AF295806542f5';
const BTC_POOL_TUP_CONTRACT = '0x475589b0Ed87591A893Df42EC6076d2499bB63d0';
const ETH_POOL_TUP_CONTRACT = '0xD7fEB276ba254cD9b34804A986CE9a8C3E359148';

const AVAX_POOL_REWARDER_CONTRACT = '0x6373122eD8Eda8ECA439415709318DCB6ddC1af3';
const USDT_POOL_REWARDER_CONTRACT = '0xBC6Ef309f2eC71698eA310D62FF2E0543472D965';
const USDC_POOL_REWARDER_CONTRACT = '0x596f6EFD98daF650CF98A1E62A53AB2a44e7E875';
const BTC_POOL_REWARDER_CONTRACT = '0x3FE9BE379eD15962AFAbE01c002B8c433C6Af4ec';

const WAVAX_TOKEN_ADDRESS = '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7';
const USDC_TOKEN_ADDRESS = '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E';
const USDT_TOKEN_ADDRESS = '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7';
const BTC_TOKEN_ADDRESS = '0x152b9d0FdC40C096757F570A51E494bd4b943E50';
const ETH_TOKEN_ADDRESS = '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab';

const GGAVAX_TOKEN_ADDRESS = '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3';
const SAVAX_TOKEN_ADDRESS = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';

// Arbitrum
const USDC_POOL_TUP_ARBI_CONTRACT = '0x5f3DB5899a7937c9ABF0A5Fc91718E6F813e4195';
const ETH_POOL_TUP_ARBI_CONTRACT = '0x2E2fE9Bc7904649b65B6373bAF40F9e2E0b883c5';
const ARB_POOL_TUP_ARBI_CONTRACT = '0x14c82CFc2c651700a66aBDd7dC375c9CeEFDDD72';
const BTC_POOL_TUP_ARBI_CONTRACT = '0x275Caecf5542bF4a3CF64aa78a3f57dc9939675C';
const DAI_POOL_TUP_ARBI_CONTRACT = '0x7Dcf909B1E4b280bEe72C6A69b3a7Ed8adfb63f0';

const USDC_TOKEN_ARBI_ADDRESS = '0xaf88d065e77c8cc2239327c5edb3a432268e5831';
const ETH_TOKEN_ARBI_ADDRESS = '0x82af49447d8a07e3bd95bd0d56f35241523fbab1';
const ARB_TOKEN_ARBI_ADDRESS = '0x912CE59144191C1204E64559FE8253a0e49E6548';
const BTC_TOKEN_ARBI_ADDRESS = '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f';
const DAI_TOKEN_ARBI_ADDRESS = '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1';

const POOL_ADDRESS_TO_REWARDER_CONTRACT = {
  '0x2323dAC85C6Ab9bd6a8B5Fb75B0581E31232d12b': USDC_POOL_REWARDER_CONTRACT,
  '0xd222e10D7Fe6B7f9608F14A8B5Cf703c74eFBcA1': USDT_POOL_REWARDER_CONTRACT,
  '0xD26E504fc642B96751fD55D3E68AF295806542f5': AVAX_POOL_REWARDER_CONTRACT,
  '0x475589b0Ed87591A893Df42EC6076d2499bB63d0': BTC_POOL_REWARDER_CONTRACT
}

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

const getPoolBoostRate = async (poolAddress, poolTVL, chain = 'avax') => {
  if(chain === 'avax') {
    let rewarderContractAddress = POOL_ADDRESS_TO_REWARDER_CONTRACT[poolAddress];

    if(rewarderContractAddress) {
      let rewardsRatePerSecond = (await sdk.api.abi.call({
        abi: getPoolBoostRateAbi,
        chain: chain,
        target: rewarderContractAddress,
        params: [],
      })).output;

      let rewardTokenAddress = (await sdk.api.abi.call({
        abi: getBoostRewardTokenAbi,
        chain: chain,
        target: rewarderContractAddress,
        params: [],
      })).output;

      let rewardTokenPrice = await getTokenPrice(rewardTokenAddress, chain);

      return rewardsRatePerSecond * rewardTokenPrice * 86400 * 365 / poolTVL / 1e16;
      }
    }
  return 0;
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
  const usdcRewardApy = await getPoolBoostRate(USDC_POOL_TUP_CONTRACT, usdcPoolTvl, 'avax');
  const usdcPool = {
    pool: `dp-${USDC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: usdcPoolTvl,
    apyBase: await getUsdcPoolDepositRate(),
    apyReward: usdcRewardApy,
    underlyingTokens: [USDC_TOKEN_ADDRESS],
    rewardTokens: [GGAVAX_TOKEN_ADDRESS],
  };

  const usdtPoolTvl = await getUsdtPoolTVL();
  const usdtRewardApy = await getPoolBoostRate(USDT_POOL_TUP_CONTRACT, usdtPoolTvl, 'avax');
  const usdtPool = {
    pool: `dp-${USDT_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('USDt'),
    tvlUsd: usdtPoolTvl,
    apyBase: await getUsdtPoolDepositRate(),
    apyReward: usdtRewardApy,
    underlyingTokens: [USDT_TOKEN_ADDRESS],
    rewardTokens: [SAVAX_TOKEN_ADDRESS],
  };

  const wavaxPoolTvl = await getWavaxPoolTVL();
  const wavaxRewardApy = await getPoolBoostRate(WAVAX_POOL_TUP_CONTRACT, wavaxPoolTvl, 'avax');
  const wavaxPool = {
    pool: `dp-${WAVAX_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('WAVAX'),
    tvlUsd: wavaxPoolTvl,
    apyBase: await getWavaxPoolDepositRate(),
    apyReward: wavaxRewardApy,
    underlyingTokens: [WAVAX_TOKEN_ADDRESS],
    rewardTokens: [SAVAX_TOKEN_ADDRESS],
  };

  const btcPoolTvl = await getBtcPoolTVL();
  const btcRewardApy = await getPoolBoostRate(BTC_POOL_TUP_CONTRACT, btcPoolTvl, 'avax');
  const btcPool = {
    pool: `dp-${BTC_TOKEN_ADDRESS}-avalanche`,
    chain: utils.formatChain('avalanche'),
    project: 'deltaprime',
    symbol: utils.formatSymbol('BTC.b'),
    tvlUsd: btcPoolTvl,
    apyBase: await getBtcPoolDepositRate(),
    apyReward: btcRewardApy,
    underlyingTokens: [BTC_TOKEN_ADDRESS],
    rewardTokens: [GGAVAX_TOKEN_ADDRESS],
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
