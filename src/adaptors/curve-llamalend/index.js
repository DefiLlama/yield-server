const utils = require('../utils');

const getLendingPoolData = async () => {
  try {
    const response = await utils.getData('https://api.curve.fi/v1/getLendingVaults/all');
    if (response.success) {
      return response.data.lendingVaultData.map(vault =>({
        pool: vault.address + '-' + vault.blockchainId,
        chain: utils.formatChain(vault.blockchainId),
        project: 'curve-llamalend',
        symbol: vault.assets.borrowed.symbol + '-' + vault.assets.collateral.symbol,
        tvlUsd: vault.usdTotal,
        underlyingTokens: [vault.assets.collateral.address],
        url: vault.lendingVaultUrls.deposit,
        apyBase: vault.rates.lendApyPcent,
        apyBaseBorrow: vault.rates.borrowApyPcent,
        totalSupplyUsd: vault.totalSupplied.usdTotal
      }))
    } else {
      console.error('Failed to fetch lending pool data');
      return [];
    }
  } catch (error) {
    console.error('Error fetching lending pool data:', error);
    return [];
  }
};

const getGaugesData = async () => {
  try {
    const response = await utils.getData('https://api.curve.fi/v1/getAllGauges');
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
  const [lendingPools, gaugesByAddress] = await Promise.all([
    getLendingPoolData(),
    getGaugesData()
  ]);

  return lendingPools.map(pool => {
    const gaugeInfo = gaugesByAddress[pool.pool.split('-')[0].toLowerCase()] || {};
    return {
      ...pool,
      apyReward: gaugeInfo.crvApy,
      rewardTokens: gaugeInfo.rewardTokens
    };
  });
};

const main = async () => {
  return await fullLendingPoolDataWithGauges();
};


module.exports = {
  apy: main,
};
