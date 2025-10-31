const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { getBlocksByTime, getData } = require('../utils');

const ADDRESSES = {
  base: {
    AvantisVault: '0x944766f715b51967E56aFdE5f0Aa76cEaCc9E7f9',
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
};

const main = async (timestamp = null) => {
  const { meta } = await getData(
    'https://api.avantisfi.com/v1/vault/returns-7-days'
  );

  let vaultTvl = await sdk.api.abi.call({
    abi: 'erc20:balanceOf',
    target: ADDRESSES.base.USDC,
    params: [ADDRESSES.base.AvantisVault],
    chain: 'base',
    // block: block,
  });

  vaultTvl = vaultTvl.output / 1e6;

  const dailyReturns = meta.averageJrFees / vaultTvl;
  const apy = (1 + dailyReturns) ** 365 - 1;

  return [
    {
      pool: `AVANTIS-${ADDRESSES.base.AvantisVault}-base`.toLowerCase(),
      chain: 'base',
      project: 'avantis',
      symbol: 'USDC',
      poolMeta: 'vault',
      tvlUsd: vaultTvl,
      apyBase: apy * 100,
      url: 'https://www.avantisfi.com/earn/avantis-vault',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
};
