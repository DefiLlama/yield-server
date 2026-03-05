const sdk = require('@defillama/sdk');
const utils = require('../utils');

const abiAAVEPolygon = require('./abiAAVEPolygon.json');
const abiAAVEAvalanche = require('./abiAAVEAvalanche.json');
const abiMakerDAO = require('./abiMakerDAO.json');
const abiConvex = require('./abiConvex.json');
const abiBenqi = require('./abiBenqiAvalanche.json');
const abiCurveDex = require('./abiCurveDEX.json');
const abiLido = require('./abiLido.json');
const abiEthenaEthereum = require('./abiEthenaEthereum.json');

// Underlying token addresses
const tokens = {
  ethereum: {
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EeadC7c9CaA3c2c',
    WETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    stETH: '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84',
    USDe: '0x4c9EDD5852cd905f086C759E8383e09bff1E68B3',
    crvUSD: '0xf939E0A03FB07F59A73314E73794Be0E57ac1b4E',
  },
  polygon: {
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174', // USDC.e
  },
  avax: {
    USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  },
};

const getPoolData = async ({ contract, abi, chain, exchangeRate = 1, underlyingTokens }) => {
  const { output: tvlUsd } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'totalAssets'),
    chain,
  });
  
  const { output: decimals } = await sdk.api.abi.call({
    target: contract,
    abi: abi.find((m) => m.name === 'decimals'),
    chain,
  });

  const poolsData = await utils.getData(
    'https://api.return.finance//api/our-pools'
  );

  const currentPool = poolsData.pools.find((pool) => {
    const incomingChainParam = chain === 'avax' ? 'avalanche' : chain;

    return (
      pool.networkName.toLowerCase() === incomingChainParam &&
      pool.returnContractAddress.toLowerCase() === contract.toLowerCase()
    );
  });

  return {
    pool: `${contract}-${chain}`,
    chain,
    project: 'return-finance',
    symbol: currentPool?.poolPair,
    tvlUsd: (tvlUsd / Math.pow(10, decimals)) * exchangeRate,
    apyBase: currentPool?.apy,
    underlyingTokens,
  };
};

const getApy = async () => {
  const ethExchangeRates = await utils.getData(
    'https://api.coinbase.com/v2/exchange-rates?currency=ETH'
  );

  const ethUsdExchangeRate = ethExchangeRates.data.rates.USDC;

  const aavePolygon = await getPoolData({
    contract: '0x0271a46c049293448c2d4794bcd51f953bf742e8',
    abi: abiAAVEPolygon,
    chain: 'polygon',
    underlyingTokens: [tokens.polygon.USDC],
  });

  const aaveAvalanche = await getPoolData({
    contract: '0x0271A46c049293448C2d4794bCD51f953Bf742e8',
    abi: abiAAVEAvalanche,
    chain: 'avax',
    underlyingTokens: [tokens.avax.USDC],
  });

  const benqi = await getPoolData({
    contract: '0x3A3dAdbca3ec5a815431f45eca33EF1520388Ef2',
    abi: abiBenqi,
    chain: 'avax',
    underlyingTokens: [tokens.avax.USDC],
  });

  const makerDao = await getPoolData({
    contract: '0xD8785CDae9Ec24b8796c45E3a2D0F7b03194F826',
    abi: abiMakerDAO,
    chain: 'ethereum',
    underlyingTokens: [tokens.ethereum.DAI],
  });

  const convexFinance = await getPoolData({
    contract: '0x4D7F26a161a3e1fbE10C11e1c9abC05Fa43DdE67',
    abi: abiConvex,
    chain: 'ethereum',
    underlyingTokens: [tokens.ethereum.crvUSD],
  });

  const curveDEX = await getPoolData({
    contract: '0xc2d4d9070236bA4ffefd7cf565eb98d11bFeB8E1',
    abi: abiCurveDex,
    chain: 'ethereum',
    underlyingTokens: [tokens.ethereum.crvUSD],
  });

  const lido = await getPoolData({
    contract: '0x2C2f0FFbFA1B8b9C85400f1726e1bc0892e63D9F',
    abi: abiLido,
    chain: 'ethereum',
    exchangeRate: Number(ethUsdExchangeRate),
    underlyingTokens: [tokens.ethereum.stETH],
  });

  const ethenaEthereum = await getPoolData({
    contract: '0x4cba5780Dcbee1c8B5220D24f4F54e14D796a31C',
    abi: abiEthenaEthereum,
    chain: 'ethereum',
    underlyingTokens: [tokens.ethereum.USDe],
  });

  return [
    aavePolygon,
    aaveAvalanche,
    benqi,
    makerDao,
    convexFinance,
    curveDEX,
    lido,
    ethenaEthereum,
  ].filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://return.finance',
};
