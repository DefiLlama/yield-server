const utils = require('../utils');

const chains = {
  ethereum: 1,
  fantom: 250,
  arbitrum: 42161,
  optimism: 10,
};

const getApy = async () => {
  const data = await Promise.all(
    Object.entries(chains).map(async (chain) => {
      const data = await utils.getData(
        `https://ydaemon.yearn.finance/${chain[1]}/vaults/all`
      );

      return data.map((p) => {
        if (p.details.retired) return {};
        return {
          pool: p.address,
          chain: utils.formatChain(chain[0]),
          project: 'yearn-finance',
          symbol: utils.formatSymbol(p.token.display_symbol),
          tvlUsd: p.tvl.tvl_deposited,
          apy: p.apy.net_apy * 100,
          url: `https://yearn.finance/vaults/${chains[chain[0]]}/${p.address}`,
        };
      });
    })
  );

  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
