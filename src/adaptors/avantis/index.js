const utils = require('../utils');
const sdk = require('@defillama/sdk');
const abiVaultManager = require('./abiVaultManager');

const ADDRESSES = {
  base: {
    AvantisJuniorTranche: '0x944766f715b51967E56aFdE5f0Aa76cEaCc9E7f9',
    AvantisSeniorTranche: '0x83084cB182162473d6FEFfCd3Aa48BA55a7B66F7',
    AvantisVaultManager: '0xe9fB8C70aF1b99F2Baaa07Aa926FCf3d237348DD',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
};

const API_BASE = 'https://api.avantisfi.com/v1/history/vaults/apr/';

const main = async () => {
  const [jrData, srData] = await Promise.all([
    utils.getData(`${API_BASE}${ADDRESSES.base.AvantisJuniorTranche}/7`),
    utils.getData(`${API_BASE}${ADDRESSES.base.AvantisSeniorTranche}/7`),
  ]);

  if (jrData.success === false || srData.success === false) {
    throw new Error('API response is not successful');
  }

  const { averageApr: jrAverageApr, averageFee: jrAverageFee } = jrData;
  const { averageApr: srAverageApr, averageFee: srAverageFee } = srData;

  let [reserveRatio, profitMultiplier, jrTvl, srTvl] = await Promise.all([
    sdk.api.abi.call({
      target: ADDRESSES.base.AvantisVaultManager,
      abi: abiVaultManager.find((m) => m.name === 'getReserveRatio'),
      params: [0],
      chain: 'base',
    }),
    sdk.api.abi.call({
      target: ADDRESSES.base.AvantisVaultManager,
      abi: abiVaultManager.find((m) => m.name === 'getProfitMultiplier'),
      chain: 'base',
    }),
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.USDC,
      params: [ADDRESSES.base.AvantisJuniorTranche],
      chain: 'base',
    }),
    sdk.api.abi.call({
      abi: 'erc20:balanceOf',
      target: ADDRESSES.base.USDC,
      params: [ADDRESSES.base.AvantisSeniorTranche],
      chain: 'base',
    }),
  ]);

  jrTvl = jrTvl.output / 1e6;
  srTvl = srTvl.output / 1e6;

  const jrFeeSplit =
    (parseFloat(profitMultiplier.output) * parseFloat(reserveRatio.output)) /
    100;

  let adjApyJr = 0,
    adjApySr = 0;

  if (jrAverageApr > 0 && jrTvl > 0) {
    adjApyJr = ((1 + jrAverageFee / jrTvl) ** 365 - 1) * jrFeeSplit;
  }

  if (srAverageApr > 0 && srTvl > 0) {
    adjApySr = ((1 + srAverageFee / srTvl) ** 365 - 1) * (100 - jrFeeSplit);
  }

  return [
    {
      pool: `AVANTIS-${ADDRESSES.base.AvantisJuniorTranche}-base`.toLowerCase(),
      chain: 'base',
      project: 'avantis',
      symbol: 'USDC',
      poolMeta: 'junior',
      tvlUsd: jrTvl,
      apyBase: adjApyJr,
      url: 'https://www.avantisfi.com/earn/junior',
    },
    {
      pool: `AVANTIS-${ADDRESSES.base.AvantisSeniorTranche}-base`.toLowerCase(),
      chain: 'base',
      project: 'avantis',
      symbol: 'USDC',
      poolMeta: 'senior',
      tvlUsd: srTvl,
      apyBase: adjApySr,
      url: 'https://www.avantisfi.com/earn/senior',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
};
