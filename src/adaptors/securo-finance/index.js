const sdk = require('@defillama/sdk');
const abiLci = require('./abiLci.json');

const config = {
  bsc: {
    vaults: {
      LCIBsc: '0x8FD52c2156a0475e35E0FEf37Fa396611062c9b6',
    },
  },
  aurora: {
    vaults: {
      BNIAurora: '0x72eB6E3f163E8CFD1Ebdd7B2f4ffB60b6e420448',
    },
  },
  polygon: {
    vaults: {
      BNIPolygon: '0xF9258759bADb75a9eAb16933ADd056c9F4E489b6',
    },
  },
  avax: {
    vaults: {
      MWIAvalanche: '0x5aCBd5b82edDae114EC0703c86d163bD0107367c',
      BNIAvalanche: '0xe76367024ca3AEeC875A03BB395f54D7c6A82eb0',
    },
  },
};

const getApy = async () => {
  const apys = await Promise.all(
    Object.keys(config).map(async (chain) => {
      const vaults = Object.values(config[chain].vaults);
      const balances = (
        await sdk.api.abi.multiCall({
          abi: abiLci.getAPR,
          calls: vaults.map((i) => ({ target: i })),
          chain,
        })
      ).output.map(({ output }) => ((1 + output / 1e18 / 52) ** 52 - 1) * 100);
      return balances;
    })
  );

  const tvls = await Promise.all(
    Object.keys(config).map(async (chain) => {
      const vaults = Object.values(config[chain].vaults);
      const balances = (
        await sdk.api.abi.multiCall({
          abi: abiLci.getAllPoolInUSD,
          calls: vaults.map((i) => ({ target: i })),
          chain,
        })
      ).output.map(({ output }) => output / 1e18);
      return balances;
    })
  );

  return [
    {
      pool: config.bsc.vaults.LCIBsc,
      chain: 'Binance',
      project: 'securo-finance',
      symbol: `USDT`,
      tvlUsd: Number(tvls[0]),
      apy: Number(apys[0]),
    },
    {
      pool: config.aurora.vaults.BNIAurora,
      chain: 'Aurora',
      project: 'securo-finance',
      symbol: `USDT`,
      tvlUsd: Number(tvls[1]),
      apy: Number(apys[1]),
    },
    {
      pool: config.polygon.vaults.BNIPolygon,
      chain: 'Polygon',
      project: 'securo-finance',
      symbol: `USDT`,
      tvlUsd: Number(tvls[2]),
      apy: Number(apys[2]),
    },
    {
      pool: config.avax.vaults.MWIAvalanche,
      chain: 'Avalanche',
      project: 'securo-finance',
      symbol: `USDT`,
      tvlUsd: Number(tvls[3][0]),
      apy: Number(apys[3][0]),
    },
    {
      pool: config.avax.vaults.BNIAvalanche,
      chain: 'Avalanche',
      project: 'securo-finance',
      symbol: `USDT`,
      tvlUsd: Number(tvls[3][1]),
      apy: Number(apys[3][1]),
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.securo.finance/',
};
