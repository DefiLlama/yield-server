const utils = require('../utils');

const CHAIN = 'base';

const vaults = [
  {
    address: '0x0e1a8354e10057092ecb7218b784c0c21710db91',
    symbol: 'USDC',
    underlyingToken: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    decimals: 6,
    poolMeta: 'Snowbl Vault USD',
  },
  {
    address: '0xffa67bd20e656f1c7873525df81728e9d26c8ee2',
    symbol: 'WETH',
    underlyingToken: '0x4200000000000000000000000000000000000006',
    decimals: 18,
    poolMeta: 'Snowbl Vault ETH',
  },
  {
    address: '0xf423393e84ca810e1955a7806d1cd84d18099809',
    symbol: 'cbBTC',
    underlyingToken: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
    decimals: 8,
    poolMeta: 'Snowbl Vault BTC',
  },
];

const apy = async (timestamp) => {
  const { pricesByAddress } = await utils.getPrices(
    vaults.map((v) => v.underlyingToken),
    CHAIN
  );

  return Promise.all(
    vaults.map(async (v) => {
      const { tvl, ...rest } = await utils.getERC4626Info(
        v.address,
        CHAIN,
        timestamp
      );
      const price = pricesByAddress[v.underlyingToken.toLowerCase()];
      if (price == null || !Number.isFinite(price)) {
        throw new Error(
          `Missing/invalid price for ${v.underlyingToken} on ${CHAIN}`
        );
      }

      return {
        ...rest,
        project: 'snowbl-capital',
        symbol: v.symbol,
        tvlUsd: (tvl / 10 ** v.decimals) * price,
        underlyingTokens: [v.underlyingToken],
        poolMeta: v.poolMeta,
        url: 'https://snowbl.capital',
      };
    })
  );
};

module.exports = {
  protocolId: '6786',
  timetravel: false,
  apy,
  url: 'https://snowbl.capital',
};
