const sdk = require('@defillama/sdk3');
const utils = require('../utils');

const {
  getMuxLpApr,
  getGlpApr,
  getVlpApr,
  getLodestarApr,
  getLodestarTokenPriceInUSD,
  getPendleApr,
} = require('./strategy-adapter');

// TODO: add more vaults incrementaly along with the strategy adapter
const vaults = [
  {
    poolAddress: '0x89e06Baa8E09Bf943a767788Cf00C9f9e9a873d9',
    strategy: 'GLPStrategy',
    symbol: 'factGAC',
    underlyingToken: '0x5402B5F40310bDED796c7D0F3FF6683f5C0cFfdf',
  },
  {
    poolAddress: '0x9F7323E95F9ee9f7Ec295d7545e82Cd93fA13f97',
    strategy: 'MuxStrategy',
    symbol: 'muxpMAC',
    underlyingToken: '0x7CbaF5a14D953fF896E5B3312031515c858737C8',
  },
  // {
  //   poolAddress: '0x3DAe492145e0631D341617bAA81a4c72C2CD4b99',
  //   strategy: 'TraderJoeStrategy',
  //   symbol: 'factJAC',
  //   underlyingToken: '0x371c7ec6D8039ff7933a2AA28EB827Ffe1F52f07',
  // },
  // {
  //   poolAddress: '0xF45A9E3f2F5984BaB983C9f245204DE23aE3b1A1',
  //   strategy: 'SiloStrategy',
  //   symbol: 'siloSUAC',
  //   underlyingToken: '0x55ADE3B74abef55bF379FF6Ae61CB77a405Eb4A8',
  // },
  // {
  //   poolAddress: '0xdfD0a93a22CAE02C81CCe29A6A6362Bec2D2C282',
  //   strategy: 'SiloStrategy',
  //   symbol: 'siloSGAC',
  //   underlyingToken: '0x96E1301bd2536A3C56EBff8335FD892dD9bD02dC',
  // },
  {
    poolAddress: '0xE990f7269E7BdDa64b947C81D69aed92a68cEBC6',
    strategy: 'PendleStrategy',
    symbol: 'factWAC',
    underlyingToken: '0x08a152834de126d2ef83D612ff36e4523FD0017F',
  },
  {
    poolAddress: '0xEb6c9C35f2BBeeDd4CECc717a869584f85C17d67',
    strategy: 'PendleStrategy',
    symbol: 'factRAC',
    underlyingToken: '0x14FbC760eFaF36781cB0eb3Cb255aD976117B9Bd',
  },
  {
    poolAddress: '0xe4a286bCA6026CccC7D240914c34219D074F4020',
    strategy: 'VelaStrategy',
    symbol: 'factVAC',
    underlyingToken: '0xC5b2D9FDa8A82E8DcECD5e9e6e99b78a9188eB05',
  },
  // {
  //   poolAddress: '0x32d1778be7aF21E956DFA38683a707F5539cFc8c',
  //   strategy: 'OliveStrategy',
  //   symbol: 'olivPPO',
  //   underlyingToken: '0x5402B5F40310bDED796c7D0F3FF6683f5C0cFfdf',
  // },
  {
    poolAddress: '0x9Ae93cb28F8A5e6D31B9F9887d57604B31DcC42E',
    strategy: 'LodestarStrategy',
    symbol: 'lodePAC',
    underlyingToken: '0x1ca530f02DD0487cef4943c674342c5aEa08922F',
  },
  // {
  //   poolAddress: '0x18dFCCb8EAc64Da10DCc5cbf677314c0125B6C4B',
  //   strategy: 'TenderStrategy',
  //   symbol: 'factTAC',
  //   underlyingToken: '0x068485a0f964B4c3D395059a19A05a8741c48B4E',
  // },
  // {
  //   poolAddress: '0x52459E1FA6E71BCB93C84c2e2b438ED797A8F3a8',
  //   strategy: 'PerennialStrategy',
  //   symbol: 'pereBCA',
  //   underlyingToken: '0x5A572B5fBBC43387B5eF8de2C4728A4108ef24a6',
  // },
  // {
  //   poolAddress: '0xc994bC98251E043D4681Af980b1E487CfC88193a',
  //   strategy: 'RedactedStrategy',
  //   symbol: 'redaPMY',
  //   underlyingToken: '0x9A592B4539E22EeB8B2A3Df679d572C7712Ef999',
  // },
  // {
  //   poolAddress: '0xfc0D36C2781F26377da6b72Ab448F5b2a71e7D14',
  //   strategy: 'PenpieStrategy',
  //   symbol: 'pieWEAC',
  //   underlyingToken: '0x08a152834de126d2ef83D612ff36e4523FD0017F',
  // },
  // {
  //   poolAddress: '0xA92c3927A69cBb48735DE6aBf477ea5281152Ef3',
  //   strategy: 'PenpieStrategy',
  //   symbol: 'pieREAC',
  //   underlyingToken: '0x14FbC760eFaF36781cB0eb3Cb255aD976117B9Bd',
  // },
];

/*//////////////////////////////////////////////////////////////////////////////
                                   APR utils                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getApr(poolAddress, underlyingTokenAddress, strategy) {
  let apr = 0;
  switch (strategy) {
    case 'GLPStrategy':
      apr = await getGlpApr();
      break;
    case 'MuxStrategy':
      apr = await getMuxLpApr();
      break;
    case 'VelaStrategy':
      apr = await getVlpApr();
      break;
    case 'LodestarStrategy':
      apr = await getLodestarApr(underlyingTokenAddress);
      break;
    case 'PendleStrategy':
      apr = await getPendleApr(underlyingTokenAddress);
      break;
    default:
      apr = 0;
  }

  const harvestCountPerDay = 3;
  const apyBase = utils.aprToApy(apr, harvestCountPerDay * 365);

  return apyBase;
}

/*//////////////////////////////////////////////////////////////////////////////
                                   TVL utils                                             
//////////////////////////////////////////////////////////////////////////////*/

async function getTvl(poolAddress, underlyingTokenAddress, strategy) {
  let underlyingTokenPrice = 0;

  if (strategy == 'LodestarStrategy') {
    underlyingTokenPrice = await getLodestarTokenPriceInUSD(
      underlyingTokenAddress
    );
  } else {
    underlyingTokenPrice = (
      await utils.getPrices([underlyingTokenAddress], 'arbitrum')
    ).pricesByAddress[underlyingTokenAddress.toLowerCase()];
  }

  const [{ output: assetBalance }, { output: assetDecimals }] =
    await Promise.all([
      sdk.api.abi.call({
        target: poolAddress,
        abi: 'uint256:assetBalance',
        chain: 'arbitrum',
      }),
      sdk.api.abi.call({
        target: underlyingTokenAddress,
        abi: 'erc20:decimals',
        chain: 'arbitrum',
      }),
    ]);

  const tvlUsd = (assetBalance / 10 ** assetDecimals) * underlyingTokenPrice;

  return tvlUsd;
}

/*//////////////////////////////////////////////////////////////////////////////
                    Strategy Router to Calculate TVL and APY                                                            
//////////////////////////////////////////////////////////////////////////////*/

async function poolDataRouter(poolAddress, underlyingTokenAddress, strategy) {
  const [tvlUsd, apyBase] = await Promise.all([
    getTvl(poolAddress, underlyingTokenAddress, strategy),
    getApr(poolAddress, underlyingTokenAddress, strategy),
  ]);
  return { tvlUsd, apyBase };
}

/*//////////////////////////////////////////////////////////////////////////////
                            Defillama Pools Handler                                                    
//////////////////////////////////////////////////////////////////////////////*/

async function getSingleYieldVaultAPY() {
  const poolData = await Promise.all(
    vaults.map(async (item) => {
      const project = 'factor-v2';
      const chain = 'arbitrum';
      const pool = `${item.poolAddress}-${chain}`.toLowerCase();
      const url = `https://app.factor.fi/vault/${item.poolAddress}`;
      const symbol = item.symbol;

      const { tvlUsd, apyBase } = await poolDataRouter(
        item.poolAddress,
        item.underlyingToken,
        item.strategy
      );

      return {
        pool,
        chain,
        project,
        symbol,
        tvlUsd,
        apyBase,
        underlyingTokens: [item.underlyingToken],
        url,
      };
    })
  );

  return poolData;
}

module.exports = {
  timetravel: false,
  apy: getSingleYieldVaultAPY,
};
