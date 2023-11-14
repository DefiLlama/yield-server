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
      const borrowApy = parseFloat(rate) * 100;
      const utilization = Number(borrowed) / Number(deposited);
      const available = Number(deposited) - Number(borrowed);
      const lendApy = utilization ? utilization * borrowApy : borrowApy;

      if ('live' in contract.config.oracle) {
        const { exchange_rate } = await utils.getData(
          `https://rest.cosmos.directory/kujira/oracle/denoms/${contract.config.oracle.live}/exchange_rate`
        );
        const totalSupplyUsd =
          (Number(deposited) * exchange_rate) / 10 ** contract.config.decimals;
        const totalBorrowUsd =
          (Number(borrowed) * exchange_rate) / 10 ** contract.config.decimals;

        return {
          pool: contract.address,
          chain: utils.formatChain('kujira'),
          project,
          symbol: utils.formatSymbol(contract.config.oracle.live),
          tvlUsd: (available * exchange_rate) / 10 ** contract.config.decimals,
          apy: lendApy,
          apyBaseBorrow: borrowApy,
          apyRewardBorrow: 0,
          totalSupplyUsd,
          totalBorrowUsd,
        };
      } else {
        const totalSupplyUsd =
          Number(deposited) / 10 ** contract.config.decimals;
        const totalBorrowUsd =
          Number(borrowed) / 10 ** contract.config.decimals;

        return {
          pool: contract.address,
          chain: utils.formatChain('kujira'),
          project,
          symbol: utils.formatSymbol('USK'),
          tvlUsd: available / 10 ** contract.config.decimals,
          apy: lendApy,
          apyBaseBorrow: borrowApy,
          apyRewardBorrow: 0,
          totalSupplyUsd,
          totalBorrowUsd,
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
