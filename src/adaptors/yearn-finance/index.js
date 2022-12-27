const utils = require('../utils');

const baseUrl = 'https://api.yearn.finance/v1/chains';

const chains = {
  ethereum: 1,
  fantom: 250,
  arbitrum: 42161,
  optimism: 10,
};

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      const data = (
        await utils.getData(`${baseUrl}/${chain[1]}/vaults/all`)
      ).filter((p) => p.type === 'v2');

      return data.map((p) => {
        return {
          pool: p.address,
          chain: utils.formatChain(chain[0]),
          project: 'yearn-finance',
          symbol: utils.formatSymbol(p.symbol),
          tvlUsd: p.tvl.tvl,
          apy: p.apy.net_apy * 100,
          url: `https://yearn.finance/vaults/${chains[chain[0]]}/${p.address}`,
        };
      });
    })
  );

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
