const utils = require('../utils');

const getLendingPoolData = async () => {
  try {
    const response = await utils.getData('https://api.curve.finance/v1/getLendingVaults/all');
    if (response.success) {
      const chains = [...new Set(response.data.lendingVaultData.map(v => v.blockchainId))];
      const pools = response.data.lendingVaultData.map(vault =>({
        pool: vault.address + '-' + vault.blockchainId,
        chain: utils.formatChain(vault.blockchainId),
        project: 'curve-llamalend',
        symbol: utils.formatSymbol(vault.assets.borrowed.symbol),
        poolMeta: vault.assets.collateral.symbol + ' collateral',
        tvlUsd: vault.usdTotal,
        underlyingTokens: [vault.assets.borrowed.address],
        url: vault.lendingVaultUrls.deposit,
        apyBase: vault.rates.lendApyPcent,
        apyBaseBorrow: vault.rates.borrowApyPcent,
        totalSupplyUsd: vault.totalSupplied.usdTotal,
        totalBorrowUsd: vault.borrowed.usdTotal
      }));
      return { pools, chains };
    } else {
      console.error('Failed to fetch lending pool data');
      return { pools: [], chains: [] };
    }
  } catch (error) {
    console.error('Error fetching lending pool data:', error);
    return { pools: [], chains: [] };
  }
};

const getLtvData = async (chains) => {
  const ltvByVault = {};
  await Promise.all(
    chains.map(async (chain) => {
      try {
        const data = await utils.getData(
          `https://prices.curve.finance/v1/lending/markets/${chain}?page=1&per_page=100`
        );
        if (data?.data) {
          for (const market of data.data) {
            ltvByVault[market.vault.toLowerCase()] = market.max_ltv / 100;
          }
        }
      } catch (e) {
        console.error(`Failed to fetch LTV data for ${chain}:`, e);
      }
    })
  );
  return ltvByVault;
};

const getGaugesData = async () => {
  try {
    const response = await utils.getData('https://api.curve.finance/v1/getAllGauges');
    if (response.success) {
      const gaugesByAddress = {};
      Object.entries(response.data).forEach(([key, gauge]) => {
        if (gauge.lendingVaultAddress) {
          gaugesByAddress[gauge.lendingVaultAddress.toLowerCase()] = {
            crvApy: gauge.gaugeCrvApy ? gauge.gaugeCrvApy[0] : null,
            rewardTokens: gauge.gaugeCrvApy ? ['0xD533a949740bb3306d119CC777fa900bA034cd52'] : null
          };
        }
      });
      return gaugesByAddress;
    } else {
      console.error('Failed to fetch gauges data');
      return {};
    }
  } catch (error) {
    console.error('Error fetching gauges data:', error);
    return {};
  }
};

const fullLendingPoolDataWithGauges = async () => {
  const [{ pools: lendingPools, chains }, gaugesByAddress] = await Promise.all([
    getLendingPoolData(),
    getGaugesData()
  ]);

  const ltvByVault = await getLtvData(chains);

  return lendingPools.map(pool => {
    const vaultAddress = pool.pool.split('-')[0].toLowerCase();
    const gaugeInfo = gaugesByAddress[vaultAddress] || {};
    const ltv = ltvByVault[vaultAddress];
    return {
      ...pool,
      apyReward: gaugeInfo.crvApy,
      rewardTokens: gaugeInfo.rewardTokens,
      ...(ltv !== undefined && { ltv })
    };
  });
};

const main = async () => {
  return await fullLendingPoolDataWithGauges();
};


module.exports = {
  apy: main,
};
