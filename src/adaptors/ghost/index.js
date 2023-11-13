const utils = require('../utils');

const uniquePools = new Set();
const project = 'ghost';

const getApy = async () => {
  const res = await fetch(
    'https://raw.githubusercontent.com/Team-Kujira/kujira.js/master/src/resources/contracts.json'
  );
  const contracts = await res.json();
  const vaultContracts = contracts['kaiyo-1'].ghostVault;
  return await Promise.all(
    vaultContracts.map(async (contract) => {
      const { data } = await utils.getData(
        `https://rest.cosmos.directory/kujira/cosmwasm/wasm/v1/contract/${contract.address}/smart/eyJzdGF0dXMiOnt9fQ==`
      );
      const { deposited, borrowed, rate } = data;
      const apy = parseFloat(rate) * 100;

      if ('live' in contract.config.oracle) {
        const { exchange_rate } = await utils.getData(
          `https://rest.cosmos.directory/kujira/oracle/denoms/${contract.config.oracle.live}/exchange_rate`
        );
        return {
          pool: contract.address,
          chain: utils.formatChain('kujira'),
          project,
          symbol: utils.formatSymbol(contract.config.oracle.live),
          tvlUsd:
            (Number(deposited) * exchange_rate) /
            10 ** contract.config.decimals,
          apy,
        };
      } else {
        return {
          pool: contract.address,
          chain: utils.formatChain('kujira'),
          project,
          symbol: utils.formatSymbol('USK'),
          tvlUsd: Number(deposited) / 10 ** contract.config.decimals,
          apy,
        };
      }
    })
  );
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://ghost.kujira.network/lend',
};
