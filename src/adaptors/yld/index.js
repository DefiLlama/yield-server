const utils = require('../utils');

const VAULTS = {
  ycvxcrv: {
    address: '0x95f19B19aff698169a1A0BBC28a2e47B14CB9a86',
    symbol: 'ycvxCRV',
    underlying: '0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7',
  },
  yscvxcrv: {
    address: '0xCa960E6DF1150100586c51382f619efCCcF72706',
    symbol: 'yscvxCRV',
    underlying: '0x62B9c7356A2Dc64a1969e19C23e4f579F9810Aa7',
  },
  yscvx: {
    address: '0x1Fd0A85084fC61c397AC619c4F0bA2350eA1cE9e',
    symbol: 'ysCVX',
    underlying: '0x4e3FBD56CD56c3e72c1403e103b45Db9da5B9D2B',
  },
};

const getApy = async () => {
  // Fetch underlying token prices
  const underlyingAddresses = [...new Set(Object.values(VAULTS).map((v) => v.underlying))];
  const priceData = await utils.getPrices(underlyingAddresses, 'ethereum');
  const prices = priceData.pricesByAddress;

  const pools = await Promise.all(
    Object.entries(VAULTS).map(async ([key, vault]) => {
      try {
        const info = await utils.getERC4626Info(vault.address, 'ethereum');
        const tokenPrice = prices[vault.underlying.toLowerCase()] || 0;
        return {
          pool: `${vault.address}-ethereum`.toLowerCase(),
          chain: utils.formatChain('ethereum'),
          project: 'yld',
          symbol: vault.symbol,
          tvlUsd: (info.tvl / 1e18) * tokenPrice,
          apyBase: info.apyBase,
          pricePerShare: info.pricePerShare,
          underlyingTokens: [vault.underlying],
          url: `https://yldfi.co/vaults/${key}`,
        };
      } catch (e) {
        console.error(`yld: failed to fetch ${key}:`, e.message);
        return null;
      }
    })
  );

  return pools.filter(Boolean);
};

module.exports = {
  protocolId: '7549',
  timetravel: false,
  apy: getApy,
  url: 'https://yldfi.co',
};
