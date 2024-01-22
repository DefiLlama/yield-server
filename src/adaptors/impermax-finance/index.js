const axios = require('axios');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const { tryUntilSucceed } = require('../../helper/utils');
const abi = require('./abi');
const SECONDS_IN_YEAR = BigNumber(365).times(24).times(3600);
const protocolSlug = 'impermax-finance';
const sdk = require('@defillama/sdk4');
const { getProvider } = require('@defillama/sdk4/build/general');
const { da } = require('date-fns/locale');
const { pool } = require('../rocifi-v2/abi');

const config = {
  ethereum: {
    factories: [
      '0x8C3736e2FE63cc2cD89Ee228D9dBcAb6CE5B767B'
    ],
  },
  polygon: {
    factories: [
      '0xBB92270716C8c424849F17cCc12F4F24AD4064D6',
      '0x7F7AD5b16c97Aa9C2B0447C2676ce7D5CEFEbCd3',
      '0x7ED6eF7419cD9C00693d7A4F81c2a151F49c7aC2',
    ],
  },
  arbitrum: {
    factories: [
      '0x8C3736e2FE63cc2cD89Ee228D9dBcAb6CE5B767B',
      '0x97bc7fefb84a4654d4d3938751b5fe401e8771c2',
    ]
  },
  avax: {
    factories: [
      '0x8C3736e2FE63cc2cD89Ee228D9dBcAb6CE5B767B',
      '0x9708e0b216a88d38d469b255ce78c1369ad898e6',
      '0xc7f24fd6329738320883ba429C6C8133e6492739',
    ]
  },
  moonriver: {
    factories: [
      '0x8C3736e2FE63cc2cD89Ee228D9dBcAb6CE5B767B',
    ]
  },
  canto: {
    factories: [
      '0x9708E0B216a88D38d469B255cE78c1369ad898e6',
    ]
  },
  era: {
    factories: [
      '0x6ce1a2C079871e4d4b91Ff29E7D2acbD42b46E36',
    ]
  },
  fantom: {
    factories: [
      '0x60aE5F446AE1575534A5F234D6EC743215624556',
      '0x9b4ae930255CB8695a9F525dA414F80C4C7a945B',
    ]
  },
};

const blackListedPools = {
  ethereum: [
    '0xa00d47b4b304792eb07b09233467b690db847c91'.toLowerCase(), // IMX-WETH
    '0x46af8ac1b82f73db6aacc1645d40c56191ab787b'.toLowerCase(), // NDX-ETH
    '0x8dcba0b75c1038c4babbdc0ff3bd9a8f6979dd13'.toLowerCase(), // DEFI5-ETH
    '0x08650bb9dc722c9c8c62e79c2bafa2d3fc5b3293'.toLowerCase(), // AMP-ETH
    '0xdf5096804705d135656b50b62f9ee13041253d97'.toLowerCase(), // YPIE-ETH
  ],
  polygon: [
    '0x76483d4ba1177f69fa1448db58d2f1dbe0fb65fa'.toLowerCase(), // IMX-WETH
    '0x8ce3bf56767dd87e87487f3fae63e557b821ea32'.toLowerCase(), // IMX-WETH
    '0xd4f5f9643a4368324ac920414781b1c5655baed1'.toLowerCase(), // IMX-WETH
    '0x5f819f510ca9b1469e6a3ffe4ecd7f0c1126f8f5'.toLowerCase(), // IMX-WETH
    '0x23312fceadb118381c33b34343a61c7812f7a6a3'.toLowerCase(), // IMX-WETH
    '0x5ed3147f07708a269f744b43c489e6cf3b60aec4'.toLowerCase(), // USDT-DAI
    '0xb957d5a232eebd7c4c4b0a1af9f2043430304e65'.toLowerCase(), // USDC-rUSD
    '0x87B94444d0f2c1e4610A2De8504D5d7b81898221'.toLowerCase(), // QUICK-POLYDOGE
    '0xEC07dD093007AaE16508F76C07d26217B7db9f1b'.toLowerCase(), // DarkX-XONE
  ],
  arbitrum: [
    '0xb7e5e74b52b9ada1042594cfd8abbdee506cc6c5'.toLowerCase(), // IMX-WETH
    '0xcc5c1540683aff992201d8922df44898e1cc9806'.toLowerCase(), // IMX-WETH
    '0x8884cc766b43ca10ea41b30192324c77efdd04cd'.toLowerCase(), // NYAN-ETH
    '0x4062f4775bc001595838fbaae38908b250ee07cf'.toLowerCase(), // SWPR-ETH
  ],
  avax: [
    '0xde0037afbe805c00d3cec67093a40882880779b7', // IMX-WETH
    '0xe9439f67201894c30f1c1c6b362f0e9195fb8e2c', // IMX-WETH
    '0xa34862a7de51a0e1aee6d3912c3767594390586d', // IMX-WETH
    '0x69c1c44e8742b66d892294a7eeb9aac51891b0eb', // USDC-UST
  ],
  moonriver: [
    '0x6ed3bc66dfcc5ac05daec840a75836da935fac97', // IMX-WETH
  ],
  canto: [],
  era: [],
  fantom: [
    '0x877a330af63094d88792b9ca28ac36c71673eb1c', // IMX-FTM
    '0xb97b6ed451480fe6466a558e9c54eaac32e6c696', // OXD-FTM
  ],
};

const coinGeckoChainMapping = {
  ethereum: 'ethereum',
  arbitrum: 'arbitrum-one',
  optimism: 'optimism',
  polygon: 'polygon-pos',
  fantom: 'fantom',
  avax: 'avalanche',
  moonriver: 'moonriver',
  canto: 'canto',
};

const factoryToProtocolMapping = {
  'ethereum': {
    'Uniswap': [
      '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'.toLowerCase(),
    ],
  },
  'polygon': {
    'QuickSwap': [
      '0x5671B249391cA5E6a8FE28CEb1e85Dc41c12Ba7D'.toLowerCase(),
      '0xF47B652cDE9b30D6aDd0b13027Bb7AD2F7AF04f4'.toLowerCase(),
      '0xdB76318C5C5151A4578e2Aafa11a2A2e0B03A4E5'.toLowerCase(),
    ],
    'QuickSwap V2': [
      '0x846019FB6f136fC98b80e527C3d34F39D16a38c4'.toLowerCase(),
      '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32'.toLowerCase(),
      '0xc4505cc6125d61e2a352ce5cf2129f2fb19259a8'.toLowerCase(),
    ],
    'ApeSwap': [
      '0xCf083Be4164828f00cAE704EC15a36D711491284'.toLowerCase(),
    ],
    'Tetu': [
      '0x8E45622663Bb01dc285B4F51Eb8F9FE4fa7b5899'.toLowerCase(),
    ],
    'Satin': [
      '0xCaF3Fb1b03F1D71A110167327f5106bE82beE209'.toLowerCase(),
    ],
    'Pearl': [
      '0xB07C75e3DB03Eb69F047b92274019912014Ba78e'.toLowerCase(),
      '0x1A645bfb46b00bb2dCE6a1A517D7dE2999155fe4'.toLowerCase(),
      '0xCD9277EE36594fd8bDbE0dfCF0aFD60403e632B5'.toLowerCase(),
    ],
    'Sushi': [
      '0xcb30A66e72Ed90D1b34f78fc0655895FC28bB6CF'.toLowerCase(),
      '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'.toLowerCase(),
      '0x3fDB0c33A86249ed689e497219acE3B80aFf5C0D'.toLowerCase(),
    ],
  },
  'arbitrum': {
    'Swapr': [
      '0x5643C3aCEC0D4970a385fb9Cc1555bec1d912bb8'.toLowerCase(),
      '0x4AE8915A8D11178154248C692e31710191053466'.toLowerCase(),
    ],
    'SolidLizard': [
      '0x30d7ef0d94b43BFa4Ff5935DBC608D7fc0116BB7'.toLowerCase(),
    ],
    'Ramses': [
      '0x78a2251F1AAEaA8Fc1EaFcC379663cCa3F894708'.toLowerCase(),
    ],
    'Auragi': [
      '0x268bb0220aB61Abd9BD42C5Db49470bb3E6B0b2F'.toLowerCase(),
    ],
    'Solunea': [
      '0xf540E9C05ea1b54e310644Fc48E491d365bf86ba'.toLowerCase(),
    ],
    'Chronos': [
      '0x111eEEb6bfAb9e8d0E87E45DB15031d89846e5d7'.toLowerCase(),
    ],
    'Sushi': [
      '0x270250F59C1ffA06C9e3234D528858Ff59aFCE68'.toLowerCase(),
      '0xc35DADB65012eC5796536bD9864eD8773aBc74C4'.toLowerCase(),
      '0x3fDB0c33A86249ed689e497219acE3B80aFf5C0D'.toLowerCase(),
    ],
  },
  'avax': {
    'Pangolin': [
      '0xBB92270716C8c424849F17cCc12F4F24AD4064D6'.toLowerCase(),
      '0xC596f6455054D8cdDE627096bE671e377791E295'.toLowerCase(),
      '0x0aD3E5Ff1A410610Ca2eAbfEcF703c9460766Fd3'.toLowerCase(),
      '0xca45c0b54a59C63c15b8CF436512E8Fec78d0f49'.toLowerCase(),
    ],
    'TraderJoe': [
      '0x16ED59ffbfbe62ebA9a69a304D38901F86461282'.toLowerCase(),
      '0x58Fde5bdB2C6Bd828Bc41c12a68189C7cd93dCE2'.toLowerCase(),
      '0x87da8bab9FbD09593F2368DC2F6fac3F80C2A845'.toLowerCase(),
      '0xad587138E72fc2Bc29dA99471ce4d995425d8f0a'.toLowerCase(),
      '0xbC1Bb900e34aDbb99957672361433c6ad62a0cAC'.toLowerCase(),
    ],
    'Thorus': [
      '0x9141B3d02443a84793794f661Ae1e6607A03A201'.toLowerCase(),
    ],
    'Flair': [
      '0x462bCeBb3743E5c0B126985D82782025bdeD23ca'.toLowerCase(),
    ],
    'Glacier': [
      '0x7EB705bC12f488af3310d8166D3C577ACDBC619c'.toLowerCase(),
    ],
  },
  'moonriver': {
    'Solarbeam': [
      '0xBB92270716C8c424849F17cCc12F4F24AD4064D6'.toLowerCase(),
      '0x95887654d8646C26fAb33F344576E2E74b211256'.toLowerCase(),
      '0x23bdECdB7073D5f899708f33FCaFff787b81e287'.toLowerCase(),
    ],
  },
  'canto': {
    'Velocimeter': [
      '0x1c813cDd6dAecE2CB83C52F0798504e42816E9C5'.toLowerCase(),
    ],
  },
  'era': {
    'Velocore': [
      '0x36BbDb0DEA4Aa211Dd76dF0a3201c89FD530851b'.toLowerCase(),
    ],
    'VeSync': [
      '0xCF3CAD85885254CBD445d6511c502Da095863f11'.toLowerCase(),
    ],
    'DraculaFi': [
      '0x589a63C2242c8E60cdACF6802AB04a721bA6049d'.toLowerCase(),
    ],
  },
  'fantom': {
    'Solidex': [
      '0x8610Dc1912a55761a713D827a1a1ad131bE8f579'.toLowerCase(),
      '0xF14f98E6F34C12Bd74fcEAC1668aF749fc269cFf'.toLowerCase(),
      '0x9B1434a02Ee86302d463bB6B365EbdFAc56e067A'.toLowerCase(),
      '0x95887654d8646C26fAb33F344576E2E74b211256'.toLowerCase(),
      '0xB83D21F60B73B21506c69DEcdBcF7Ab5AB737eB2'.toLowerCase(),
    ],
  },
};

let allCoins = [];

const getAllLendingPoolsForChain = async (chain, block) => {
  const { factories } = config[chain];

  // looping through all factories to get all lending pools
  let allLendingPoolAddresses = [];
  let allLendingPoolAddressesParamsCalls = [];
  let allLendingPoolAddressesTargetCalls = [];
  let allLendingPoolsDetails = [];
  let allToken0s = [];
  let allToken1s = [];
  let allLendingPoolDecimals = [];
  let allLendingPoolReserves = [];
  for (const factory of factories) {
    // get the data for the current factory
    const {
      lendingPoolAddresses,
      lendingPoolAddressesParamsCalls,
      lendingPoolAddressesTargetCalls,
      lendingPoolsDetails,
      token0s,
      token1s,
      lendingPoolDecimals,
      lendingPoolReserves,
    } = await getAllLendingPools(factory, chain, block);

    // add the data to the arrays
    allLendingPoolAddresses = [...allLendingPoolAddresses, ...lendingPoolAddresses];
    allLendingPoolAddressesParamsCalls = [...allLendingPoolAddressesParamsCalls, ...lendingPoolAddressesParamsCalls];
    allLendingPoolAddressesTargetCalls = [...allLendingPoolAddressesTargetCalls, ...lendingPoolAddressesTargetCalls];
    allLendingPoolsDetails = [...allLendingPoolsDetails, ...lendingPoolsDetails];
    allToken0s = [...allToken0s, ...token0s];
    allToken1s = [...allToken1s, ...token1s];
    allLendingPoolDecimals = [...allLendingPoolDecimals, ...lendingPoolDecimals];
    allLendingPoolReserves = [...allLendingPoolReserves, ...lendingPoolReserves];
  }

  const lendingPoolAddresses = allLendingPoolAddresses;
  const lendingPoolAddressesParamsCalls = allLendingPoolAddressesParamsCalls;
  const lendingPoolAddressesTargetCalls = allLendingPoolAddressesTargetCalls;
  const lendingPoolsDetails = allLendingPoolsDetails;
  const token0s = allToken0s;
  const token1s = allToken1s;
  const lendingPoolDecimals = allLendingPoolDecimals;
  const lendingPoolReserves = allLendingPoolReserves;

  return {
    lendingPoolAddresses: allLendingPoolAddresses,
    lendingPoolAddressesParamsCalls: allLendingPoolAddressesParamsCalls,
    lendingPoolAddressesTargetCalls: allLendingPoolAddressesTargetCalls,
    lendingPoolsDetails: allLendingPoolsDetails,
    token0s: allToken0s,
    token1s: allToken1s,
    lendingPoolDecimals: allLendingPoolDecimals,
    lendingPoolReserves: allLendingPoolReserves,
  };
}

const getAllLendingPools = async (factory, chain, block) => {
  const { output: allLendingPoolsLength } = await tryUntilSucceed(() =>
    sdk.api.abi.call({
      target: factory,
      abi: abi.allLendingPoolsLength,
      chain,
      block,
      requery: true,
    })
  );

  // get all of the lending pools from the factory contract
  const poolCalls = [];
  for (let i = 0; i < +allLendingPoolsLength; i++)
    poolCalls.push({ params: i });
  const { output: lendingPoolsResults } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      target: factory,
      abi: abi.allLendingPools,
      calls: poolCalls,
      chain,
      block,
      requery: true,
    })
  );
  let lendingPoolAddresses = lendingPoolsResults.map((i) => i.output);
  // let lendingPoolAddresses = ['0xE4702e545F4bF51FD383d00F01Bc284Ec9B8aa64', '0x06D3AE1Cfe7D3D27B8b9f541E2d76e5f33778923'];

  // remove blacklisted pools
  lendingPoolAddresses = lendingPoolAddresses.filter(
    (i) => !blackListedPools[chain].includes(i.toLowerCase())
  );

  // make sure the params and target are also filtered
  let lendingPoolAddressesParamsCalls = lendingPoolAddresses.map((i) => ({
    params: i,
  }));
  let lendingPoolAddressesTargetCalls = lendingPoolAddresses.map((i) => ({
    target: i,
  }));
  let { output: getLendingPools } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      target: factory,
      abi: abi.getLendingPool,
      calls: lendingPoolAddressesParamsCalls,
      chain,
      block,
      requery: true,
    })
  );

  let lendingPoolsDetails = getLendingPools.map((i) => i.output);

  // Removing all pool that are not initialized
  lendingPoolAddresses = lendingPoolAddresses.filter(
    (i, index) => lendingPoolsDetails[index].initialized
  );
  lendingPoolAddressesParamsCalls = lendingPoolAddressesParamsCalls.filter(
    (i, index) => lendingPoolsDetails[index].initialized
  );
  lendingPoolAddressesTargetCalls = lendingPoolAddressesTargetCalls.filter(
    (i, index) => lendingPoolsDetails[index].initialized
  );
  lendingPoolsDetails = lendingPoolsDetails.filter(
    (i, index) => lendingPoolsDetails[index].initialized
  )

  // get tokens 0 and 1 of all lending pools
  const { output: token0sResults } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      calls: lendingPoolAddressesTargetCalls,
      abi: abi.token0,
      chain,
      block,
      requery: true,
    })
  );
  const token0s = token0sResults.map((i) => i.output);
  const { output: token1sResults } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      calls: lendingPoolAddressesTargetCalls,
      abi: abi.token1,
      chain,
      block,
      requery: true,
    })
  );
  const token1s = token1sResults.map((i) => i.output);
  // get lending pool address decimals
  const { output: lendingPoolDecimalsResults } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      calls: lendingPoolAddressesTargetCalls,
      abi: abi.decimals,
      chain,
      block,
      requery: true,
    })
  );
  const lendingPoolDecimals = lendingPoolDecimalsResults.map((i) => i.output);
  const lendingPoolReserves = await getBorrowableTokensReserves(lendingPoolAddressesTargetCalls, chain, block, lendingPoolsDetails);

  return {
    lendingPoolAddresses,
    lendingPoolAddressesParamsCalls,
    lendingPoolAddressesTargetCalls,
    lendingPoolsDetails,
    token0s,
    token1s,
    lendingPoolDecimals,
    lendingPoolReserves,
  };
};

const getBorrowableTokensReserves = async (lendingPoolAddressesTargetCalls, chain, block, lendingPoolsDetails) => {
  let lendingPoolReserves = [];

  const callTargets = [];
  for (let i = 0; i < lendingPoolsDetails.length; i++) {
    const borrowable0 = lendingPoolsDetails[i].borrowable0;
    const borrowable1 = lendingPoolsDetails[i].borrowable1;
    callTargets.push([borrowable0, borrowable1].map((i) => ({ target: i })));
  }

  const { output: getReservesResults } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      calls: callTargets.flat(),
      abi: abi.totalBorrows,
      chain,
      block,
      requery: true,
    })
  );

  for (let i = 0; i < getReservesResults.length; i += 2) {
    lendingPoolReserves.push([getReservesResults[i].output, getReservesResults[i + 1].output]);
  }

  return lendingPoolReserves;
}

const getUnderlyingLiquidityPoolAddresses = async (
  lendingPoolAddresses,
  lendingPoolAddressesTargetCalls,
  chain,
  block
) => {
  const { output: lendingPoolSymbolsResults } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      calls: lendingPoolAddressesTargetCalls,
      abi: abi.symbol,
      chain,
      block,
      requery: true,
    })
  );
  const lendingPoolSymbols = lendingPoolSymbolsResults.map((i) => i.output);

  // get underlying LP related info
  let lpAddressesCalls = [];
  let lpAddressesCallsIndex = [];
  for (let index = 0; index < lendingPoolAddresses.length; index++) {
      lpAddressesCalls.push({ target: lendingPoolAddresses[index] });
      lpAddressesCallsIndex.push(index);
  }

  let underlyingLpAddresses = lendingPoolAddresses;

  if (chain !== 'ethereum') {
    const { output: underlyingLpAddressesResults } = await tryUntilSucceed(() =>
      sdk.api.abi.multiCall({
        abi: abi.underlying,
        calls: lpAddressesCalls,
        chain,
        block,
        permitFailure: true,
      }),
    );
    underlyingLpAddresses = underlyingLpAddressesResults.map((i) => i.output);
  }

  if (lpAddressesCalls.length > 0) {
    for (let x = 0; x < lpAddressesCalls.length; x++) {
      underlyingLpAddresses[lpAddressesCallsIndex[x]] =
        lendingPoolAddresses[lpAddressesCallsIndex[x]];
    }
  }
  const underlyingLpAddressesTargetCalls = underlyingLpAddresses.map((i) => ({
    target: i,
  }));
  const { output: underlyingLiquidityPoolSymbolsResults } =
    await tryUntilSucceed(() =>
      sdk.api.abi.multiCall({
        calls: underlyingLpAddressesTargetCalls,
        abi: abi.symbol,
        chain,
        block,
        requery: true,
      })
    );
  const underlyingLiquidityPoolSymbols =
    underlyingLiquidityPoolSymbolsResults.map((i) => i.output);
  return {
    lendingPoolSymbols,
    underlyingLpAddresses,
    underlyingLiquidityPoolSymbols,
  };
};

const removeDuplicatesFromArray = (arr) => {
  return [...new Set([].concat(...arr))];
};

const checkIfTokenKeyExists = (fetchedData, key) => {
  return (
    fetchedData[key]
  );
};

const buildPoolMetadata = async (
  poolData,
  tokenDetailsDict,
  chain,
  block,
) => {
  const underlyingLiquidityPoolSymbols = poolData.map((i) => i.underlyingLiquidityPoolSymbol);
  let lendingPoolAddresses = poolData.map((i) => i.lendingPoolAddress);
  const token0Symbols = poolData.map((i) => tokenDetailsDict[i.token0].symbol);
  const token1Symbols = poolData.map((i) => tokenDetailsDict[i.token1].symbol);
  const tokenSymbols = poolData.map((i) => i.tokenSymbol);
  
  // picking every other record
  const lendingPoolAddressesNoDuplicates = lendingPoolAddresses.filter((_, i) => i % 2 === 0);

  // use the factory to determine the pool name
  const { output: lendingPoolFactory } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      calls: lendingPoolAddressesNoDuplicates.map((i) => ({ target: i })),
      abi: abi.factory,
      chain,
      block,
      requery: true,
    })
  );
  const lendingPoolFactoriesNoDuplicates = lendingPoolFactory.map((i) => i.output);

  // augment the factories to match the number of pools so that factories are valid for 2 entries in the lending pool addresses
  const lendingPoolFactories = [];
  for (let i = 0; i < lendingPoolFactoriesNoDuplicates.length; i++) {
    lendingPoolFactories.push(lendingPoolFactoriesNoDuplicates[i]);
    lendingPoolFactories.push(lendingPoolFactoriesNoDuplicates[i]);
  }

  // map factories to protocol using factoryToProtocolMapping
  let formatedPoolMeta = lendingPoolFactories.map((i, fIndex) => {
    const poolId = `${lendingPoolAddresses[fIndex]}-${tokenSymbols[fIndex]}-${chain}`;
    let poolMeta;
    for (const [key, value] of Object.entries(factoryToProtocolMapping[chain])) {
      if (i !== undefined && value.includes(i.toLowerCase())) {
        poolMeta = `${key} ${token0Symbols[fIndex]}/${token1Symbols[fIndex]}`;
      }
    }

    if (poolMeta === undefined) {
      // console.log('unknown factory for pool ', poolId, ' with factory ', i);
      poolMeta = `${i} ${token0Symbols[fIndex]}/${token1Symbols[fIndex]}`;
    }

    return { poolId, poolMeta };
  });

  return formatedPoolMeta;
};

async function getTokenPrices(tokens, chain, allCoins) {
  const chainCoins = allCoins.data.filter(
    (coin) => coin && coin.platforms && coin.platforms[coinGeckoChainMapping[chain]]
  );
  
  const tokenAddresses = tokens.map((a) => a.toLowerCase());
  const coins = chainCoins.filter((coin) =>
    tokenAddresses.includes(coin.platforms[coinGeckoChainMapping[chain]].toLowerCase())
  );

  const markets = (
    await axios.get(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${coins
        .map((c) => c.id)
        .join(',')}`
    )
  ).data;

  async function getPriceFromDexScreener(token) {
    let pairs = (
      await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${token}`)
    ).data.pairs;
    if (!pairs?.length) return undefined;
    // remove pairs with no liquidity
    pairs = pairs.filter((p) => p.liquidity && p.liquidity.usd > 0);

    const totalLiquidity = pairs
      .map((p) => p.liquidity.usd)
      .reduce((a, b) => a + b, 0);
    return (
      pairs.map((p) => p.priceUsd * p.liquidity.usd).reduce((a, b) => a + b, 0) /
      totalLiquidity
    );
  }

  function getPriceFromCoinGecko(token) {
    const id = chainCoins.find(
      (coin) =>
        coin.platforms[coinGeckoChainMapping[chain]].toLowerCase() === token.toLowerCase()
    )?.id;
    if (id === undefined) return undefined;
    const marketData = markets.find((m) => m.id === id);
    return marketData?.current_price;
  }

  async function getPrice(token) {
    return (
      getPriceFromCoinGecko(token) ?? (await getPriceFromDexScreener(token))
    );
  }

  const pricePromises = tokenAddresses.map((t) =>
    getPrice(t).then((p) => [t, p])
  );
  const prices = await Promise.all(pricePromises).then((results) =>
    Object.fromEntries(results)
  );

  return prices;
}

const getTokenDetails = async (allUniqueTokens, chain, block) => {
  let results = {};
  const tokensCalls = allUniqueTokens.map((i) => ({ target: i }));
  const { output: getTokenDecimals } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      abi: `erc20:decimals`,
      calls: tokensCalls,
      chain,
      block,
      requery: true,
    })
  );
  // underlying tokens symbol just reference from bulk
  const { output: getTokenSymbols } = await tryUntilSucceed(() =>
    sdk.api.abi.multiCall({
      abi: `erc20:symbol`,
      calls: tokensCalls,
      chain,
      block,
      requery: true,
    })
  );
  const tokensSymbols = getTokenSymbols.map((i) => i.output);

  for (let i = 0; i < getTokenDecimals.length; i++) {
    tokensDecimalResult = getTokenDecimals[i];
    tokenSymbolResult = getTokenSymbols[i];
    let key = tokensDecimalResult.input.target;
    results[key] = {
      decimals: tokensDecimalResult.output,
      symbol: tokenSymbolResult.output,
    };
  }
  return results;
};

// calculate tvl function
const caculateTvl = (
  excessSupply,
  tokenDecimals,
  underlyingTokenPriceUsd,
  lpReserve
) => {
  const excessSupplyUsd = BigNumber(excessSupply)
    .div(BigNumber(10).pow(BigNumber(tokenDecimals)))
    .times(BigNumber(underlyingTokenPriceUsd));
  const lpTvlUsd = BigNumber(lpReserve)
    .div(BigNumber(10).pow(BigNumber(tokenDecimals)))
    .times(BigNumber(underlyingTokenPriceUsd));
  const totalTvl = excessSupplyUsd.plus(lpTvlUsd);

  // Impermax being a lending protocol, ltvUsd is actually the available liquidity
  // in our case, this translates directly to the excess supply
  // return ltvUsd;
  return excessSupplyUsd;
};

// calculate apy function
const calculateApy = (
  borrowRate,
  borrowableDecimal,
  totalBorrows,
  totalSupply,
  reserveFactor
) => {
  const borrowRateAPY = BigNumber(borrowRate)
    .div(BigNumber(10).pow(BigNumber(borrowableDecimal)))
    .times(SECONDS_IN_YEAR);
  const utilization = BigNumber(totalBorrows).div(BigNumber(totalSupply));
  const supplyRateAPY = BigNumber(borrowRate)
    .times(BigNumber(utilization))
    .times(
      BigNumber(10)
        .pow(BigNumber(borrowableDecimal))
        .minus(BigNumber(reserveFactor))
    )
    .times(SECONDS_IN_YEAR)
    .div(
      BigNumber(10)
        .pow(BigNumber(borrowableDecimal))
        .times(BigNumber(10).pow(BigNumber(borrowableDecimal)))
    );
  return { borrowRateAPY, utilization, supplyRateAPY };
};

const main = async () => {
  let data = [];

  allCoins = (
    await axios.get(
      'https://api.coingecko.com/api/v3/coins/list?include_platform=true'
    )
  );

  for (const chain of Object.keys(config)) {
    let collaterals = [];
    let borrowables = [];
    
    const provider = getProvider(chain);
    const block = await provider.getBlockNumber();

    const {
      lendingPoolAddresses,
      lendingPoolAddressesParamsCalls,
      lendingPoolAddressesTargetCalls,
      lendingPoolsDetails,
      token0s,
      token1s,
      lendingPoolDecimals,
      lendingPoolReserves,
    } = await getAllLendingPoolsForChain(chain, block);

    // get underlying LP related info
    const {
      lendingPoolSymbols,
      underlyingLpAddresses,
      underlyingLiquidityPoolSymbols,
    } = await getUnderlyingLiquidityPoolAddresses(
      lendingPoolAddresses,
      lendingPoolAddressesTargetCalls,
      chain,
      block
    );

    const allTokens = [...token0s, ...token1s];
    const allUniqueTokens = removeDuplicatesFromArray(allTokens);

    let fetchedPrices = await getTokenPrices(allUniqueTokens, chain, allCoins);

    // go to the next factory contract since no tokens were found here.
    if (Object.keys(fetchedPrices) === 0) {
      continue;
    }
    const tokenDetailsDict = await getTokenDetails(
      allUniqueTokens,
      chain,
      block
    );

    let allBorrowables = lendingPoolsDetails.flatMap(
      (lendingPoolDetails, i) => {
        const reserves = lendingPoolReserves[i];
        const lendingPoolAddress = lendingPoolAddresses[i];
        if (reserves === null) {
          return null;
        }
        const underlyingLiquidityPoolSymbol =
          underlyingLiquidityPoolSymbols[i];
        // check if the lending pool has a name
        if (underlyingLiquidityPoolSymbol === null) {
          return null;
        }
        const borrowable0 = lendingPoolDetails.borrowable0;
        const borrowable1 = lendingPoolDetails.borrowable1;
        const collateral = lendingPoolDetails.collateral;
        const token0 = token0s[i];
        const token1 = token1s[i];
        const lendingPoolDecimal = lendingPoolDecimals[i];

        return [
          {
            lpReserve: reserves[0],
            lendingPoolAddress,
            underlyingLiquidityPoolSymbol,
            underlyingTokenAddress: token0,
            borrowableTokenAddress: borrowable0,
            collateral,
            token0,
            token1,
            lendingPoolDecimal,
            tokenSymbol: tokenDetailsDict[token0].symbol,
            tokenDecimals: tokenDetailsDict[token0].decimals,
          },
          {
            lpReserve: reserves[1],
            lendingPoolAddress,
            underlyingLiquidityPoolSymbol,
            underlyingTokenAddress: token1,
            borrowableTokenAddress: borrowable1,
            collateral,
            token0,
            token1,
            lendingPoolDecimal,
            tokenSymbol: tokenDetailsDict[token1].symbol,
            tokenDecimals: tokenDetailsDict[token1].decimals,
          },
        ];
      }
    );

    // remove null
    allBorrowables = allBorrowables.filter((p) => p);

    const excessSupplyRes = await sdk.api.abi.multiCall({
      abi: 'erc20:balanceOf',
      calls: allBorrowables.map((b) => ({
        target: b.underlyingTokenAddress,
        params: b.borrowableTokenAddress,
      })),
      chain,
    });
    const excessSupply = excessSupplyRes.output.map((res) => res.output);

    const [
      reserveFactorRes,
      totalBorrowsRes,
      borrowRateRes,
      borrowableDecimalRes,
    ] = await Promise.all(
      ['reserveFactor', 'totalBorrows', 'borrowRate', 'decimals'].map(
        (method) =>
          sdk.api.abi.multiCall({
            abi: abi[method],
            calls: allBorrowables.map((b) => ({
              target: b.borrowableTokenAddress,
              params: null,
            })),
            chain: chain,
            requery: true,
          })
      )
    );
    const reserveFactor = reserveFactorRes.output.map((res) => res.output);
    const totalBorrows = totalBorrowsRes.output.map((res) => res.output);
    const borrowRate = borrowRateRes.output.map((res) => res.output);
    const borrowableDecimal = borrowableDecimalRes.output.map(
      (res) => res.output
    );

    const poolMetaData = await buildPoolMetadata(
      allBorrowables,
      tokenDetailsDict,
      chain,
      block,
    );

    // calculate the tvl and yields for each borrowables
    data = [
      ...data,
      ...allBorrowables
        .map((borrowable, i) => {
          // skip if no data
          if (!borrowable) {
            return null;
          }
          const totalSupply = BigNumber(totalBorrows[i]).plus(
            BigNumber(excessSupply[i])
          );
          //apy calculations
          const { borrowRateAPY, utilization, supplyRateAPY } = calculateApy(
            borrowRate[i],
            borrowableDecimal[i],
            totalBorrows[i],
            totalSupply,
            reserveFactor[i]
          );
          const { poolId, poolMeta } = poolMetaData[i];
          // if poolId is undefined, probably abi is not published so skip
          if (poolId === undefined) {
            return null;
          }

          if (!checkIfTokenKeyExists(fetchedPrices, borrowable.underlyingTokenAddress.toLowerCase())) {
            return null;
          }
          // tvl calculations
          const underlyingTokenPriceUsd =
            fetchedPrices[borrowable.underlyingTokenAddress.toLowerCase()];
          const totalTvl = caculateTvl(
            excessSupply[i],
            borrowable.tokenDecimals,
            underlyingTokenPriceUsd,
            borrowable.lpReserve
          );
          let poolData = {
            pool: `${poolId}`,
            poolMeta: `${poolMeta}`,
            chain: chain,
            project: protocolSlug,
            symbol: utils.formatSymbol(borrowable.tokenSymbol),
            tvlUsd: totalTvl.toNumber(),
            apyBase: supplyRateAPY.times(BigNumber(100)).toNumber(),
            underlyingTokens: [borrowable.token0, borrowable.token1],
          };
          // add the data if the supply apy exists and the total tvl is under the threshold
          if (!supplyRateAPY.isNaN()) {
            return poolData;
          } else {
            return null;
          }
        })
        .filter((data) => {
          return data !== null;
        }),
    ];

  }

  // remove potential dupliates based on pool ID
  data = data.filter(
    (v, i, a) => a.findIndex((t) => t.pool === v.pool) === i
  );

  return data;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.impermax.finance/',
};
