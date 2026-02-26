const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const AladdinConvexVaultABI = require('./abis/AladdinConvexVault.json');
const AladdinCRVABI = require('./abis/AladdinCRV.json');
const curvePools = require('./pools.js');

const ALADDIN_API_BASE_URL = 'https://api.aladdin.club/';

const concentratorAcrv = '0x2b95A1Dcc3D405535f9ed33c219ab38E8d7e0884';
const aladdinSdCRV = '0x43E54C2E7b3e294De3A155785F52AB49d87B9922';
const aladdinCVXAddress = '0xb0903Ab70a7467eE5756074b31ac88aEBb8fB777';
const aladdinRUSD = '0x07D1718fF05a8C53C8F05aDAEd57C0d672945f9a';
const fxSaveAddress = '0x7743e50F534a7f9F1791DdE7dCD89F7783Eefc39';
const asdPENDLEAddress = '0x606462126E4Bd5c4D153Fe09967e4C46C9c7FeCf';

// Underlying token addresses
const CRV = '0xD533a949740bb3306d119CC777fa900bA034cd52';
const sdCRV = '0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5';
const CVX = '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B';
const PENDLE = '0x808507121B80c02388fAd14726482e061B8da827';
const fxUSD = '0x085780639CC2cACd35E474e71f4d000e2405d8f6';
const rUSD = '0x65D72AA8DA931F047169112fcf34f52DBAae7D18';

// Mapping from LP token address to underlying tokens for main pools
const lpTokenUnderlyings = {
  // FRAX+USDC (crvFRAX)
  '0x3175Df0976dFA876431C2E9eE6Bc45b65d3473CC': [
    '0x853d955aCEf822Db058eb8505911ED77F175b99e', // FRAX
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  ],
  // stETH-ETH
  '0x06325440D014e39736583c165C2963BA99fAf14E': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0xae7ab96520DE3A18E5e111B5EaAb095312D7fE84', // stETH
  ],
  // tricrypto2 (USDT-wBTC-WETH)
  '0xc4AD29ba4B3c580e6D59105FFf484999997675Ff': [
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  ],
  // cvxCRV-CRV
  '0x9D0464996170c6B9e75eED71c68B99dDEDf279e8': [
    '0xD533a949740bb3306d119CC777fa900bA034cd52', // CRV
    '0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7', // cvxCRV
  ],
  // ETH-CRV (crveth)
  '0xEd4064f376cB8d68F770FB1Ff088a3d0F3FF5c4d': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0xD533a949740bb3306d119CC777fa900bA034cd52', // CRV
  ],
  // ETH-CVX (cvxeth)
  '0x3A283D9c08E8b55966afb64C515f5143cf907611': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', // CVX
  ],
  // 3pool (DAI-USDC-USDT)
  '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490': [
    '0x6B175474E89094C44Da98b954EesdeAC495271d0F', // DAI
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
  ],
  // FRAX-3Crv
  '0xd632f22692FaC7611d2AA1C0D552930D43CAEd3B': [
    '0x853d955aCEf822Db058eb8505911ED77F175b99e', // FRAX
    '0x6c3F90f043a72FA612cbac8115EE7e52BDe6E490', // 3Crv
  ],
  // ETH+ALD (aldETH)
  '0xb657B4ed5C6c81769E12BcC2f978b01DE2330EB1': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0xb26C4B3Ca601136Daf98593feAeff9E0CA702a8D', // ALD
  ],
  // rocketPoolETH (rETH-ETH)
  '0x6c38cE8984a842dd351135281a318f3d30b44A05': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0xae78736Cd615f374D3085123A210448E74Fc6393', // rETH
  ],
  // xETH+ETH (Curve xETH-ETH)
  '0x3B67fE0A0415e3ccE75E932A2A84B0685B11C2d9': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0xe063F04f280c60aECa68b38341C2eEcBeC703ae2', // xETH
  ],
  // CRV-sdCRV
  '0xf7b55C3732aD8b2c2dA7c24f30A69f55c54FB717': [
    '0xD533a949740bb3306d119CC777fa900bA034cd52', // CRV
    '0xD1b5651E55D4CeeD36251c61c50C889B36F6abB5', // sdCRV
  ],
  // clevCVX-CVX
  '0xF9078Fb962A7D68b3684f8cC2B1e9E5F1C6c87A5': [
    '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B', // CVX
    '0xf05e58fCeA29ab4dA01A495140B349F8410Ba904', // clevCVX
  ],
  // clevUSD+FRAXBP
  '0x8eB4b7a21a1E0b8CA5260890A3A2a0718AdF7063': [
    '0x3C20Ac688410bE8F391bE1fb00AFc5C212972F86', // clevUSD
    '0x853d955aCEf822Db058eb8505911ED77F175b99e', // FRAX
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
  ],
  // ETH+FXN
  '0xc15F285679a1Ef2d25F53D4CbD0265E1D02F2a92': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0x365AccFCa291e7D3914637ABf1F7635dB165Bb09', // FXN
  ],
  // ETH+CTR
  '0x3f0e7916681c55cA6b67a1a8E329841cE0D0a818': [
    '0x0000000000000000000000000000000000000000', // ETH
    '0xb3Ad645dB386D7F6D753B2b9C3F4B853DA6890B8', // CTR
  ],
  // USDC-WBTC-ETH (tricrypto-USDC)
  '0x7F86Bf177Dd4F3494b841a37e810A34dD56c829B': [
    '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  ],
  // USDT-WBTC-ETH (tricrypto-USDT)
  '0xf5f5B97624542D72A9E06f04804Bf81baA15e2B4': [
    '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT
    '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
    '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  ],
};

const getAllPools = async () => {
  let vaultsInfo = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/concentrator_pool_tvl_apy`
  );
  let pools = [];
  if (vaultsInfo.data) {
    vaultsInfo.data.map((item) => {
      pools.push({
        tvl: item.tvl,
        apy: item.apy.proApy,
        symbol: item.lpName,
        lpToken: item.address,
      });
    });
  }
  return pools;
};

const getATokenData = async () => {
  let aTokenData = await utils.getData(
    `${ALADDIN_API_BASE_URL}api1/concentrator_aToken_tvl_apy`
  );
  const { aCRV, asdCRV, aladdinCVX, arUSD, fxSave, asdPENDLE } =
    aTokenData.data;

  const newObj = [
    {
      pool: `${concentratorAcrv}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'aCRV',
      tvlUsd: parseInt(aCRV.tvl, 10),
      apy: parseFloat(aCRV.apy),
      underlyingTokens: [CRV],
    },
    {
      pool: `${aladdinSdCRV}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'asdCRV',
      tvlUsd: parseInt(asdCRV.tvl, 10),
      apy: parseFloat(asdCRV.apy),
      underlyingTokens: [sdCRV],
    },
    {
      pool: `${aladdinCVXAddress}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'aCVX',
      tvlUsd: parseInt(aladdinCVX.tvl, 10),
      apy: parseFloat(aladdinCVX.apy),
      underlyingTokens: [CVX],
    },
    {
      pool: `${aladdinRUSD}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'arUSD',
      tvlUsd: parseInt(arUSD.tvl, 10),
      apy: parseFloat(arUSD.apy),
      underlyingTokens: [rUSD],
    },
    {
      pool: `${fxSaveAddress}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'fxSave',
      tvlUsd: parseInt(fxSave.tvl, 10),
      apy: parseFloat(fxSave.apy),
      underlyingTokens: [fxUSD],
    },
    {
      pool: `${asdPENDLEAddress}-concentrator`,
      chain: utils.formatChain('ethereum'),
      project: 'concentrator',
      symbol: 'asdPENDLE',
      tvlUsd: parseInt(asdPENDLE.tvl, 10),
      apy: parseFloat(asdPENDLE.apy),
      underlyingTokens: [PENDLE],
    },
  ];
  return newObj;
};

const buildPool = (entry, chainString) => {
  const underlyings = lpTokenUnderlyings[entry.lpToken];
  const newObj = {
    pool: `${entry.lpToken}-concentrator`.toLowerCase(),
    chain: utils.formatChain(chainString),
    project: 'concentrator',
    symbol: utils.formatSymbol(entry.symbol),
    tvlUsd: parseInt(entry.tvl, 10),
    apy: parseFloat(entry.apy),
    ...(underlyings && { underlyingTokens: underlyings }),
  };
  return newObj;
};

const main = async () => {
  const dataInfo = await getAllPools();
  const aTokenData = await getATokenData();
  let data = dataInfo.map((el) => buildPool(el, 'ethereum'));
  data = data.concat(aTokenData);
  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://concentrator.aladdin.club/#/vault',
};
