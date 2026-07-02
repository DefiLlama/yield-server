const utils = require('../utils');

const isFiniteNumber = (value) => Number.isFinite(value);

const getLendingPoolData = async () => {
  try {
    const response = await utils.getData('https://api.curve.finance/v1/getLendingVaults/all');
    if (response.success) {
      const chains = [...new Set(response.data.lendingVaultData.map(v => v.blockchainId))];
      const vaults = response.data.lendingVaultData.filter((vault) => {
        const tvlUsd = vault.usdTotal;
        const totalSupplyUsd = vault.totalSupplied?.usdTotal;
        const totalBorrowUsd = vault.borrowed?.usdTotal;

        if (![tvlUsd, totalSupplyUsd, totalBorrowUsd].every(isFiniteNumber)) return false;

        return !(tvlUsd < 10 && totalBorrowUsd > totalSupplyUsd);
      });
      const pools = vaults.flatMap(vault => {
        const borrowed = vault.assets.borrowed;
        const collateral = vault.assets.collateral;
        const chain = utils.formatChain(vault.blockchainId);
        const availableBorrowUsd = Math.max(
          0,
          vault.availableToBorrow?.usdTotal ??
            vault.totalSupplied.usdTotal - vault.borrowed.usdTotal
        );

        return [
          {
            pool: vault.address + '-' + vault.blockchainId,
            chain,
            project: 'curve-llamalend',
            symbol: borrowed.symbol,
            poolMeta: collateral.symbol + ' collateral',
            tvlUsd: vault.usdTotal,
            underlyingTokens: [borrowed.address],
            url: vault.lendingVaultUrls.deposit,
            apyBase: vault.rates.lendApyPcent
          },
          {
            pool: vault.address + '-' + vault.blockchainId + '-borrow',
            chain,
            project: 'curve-llamalend',
            symbol: collateral.symbol,
            token: null,
            poolMeta: borrowed.symbol + ' borrow',
            tvlUsd: availableBorrowUsd,
            underlyingTokens: [collateral.address],
            url: vault.lendingVaultUrls.borrow,
            apy: 0,
            apyBaseBorrow: vault.rates.borrowApyPcent,
            totalSupplyUsd: 0,
            totalBorrowUsd: vault.borrowed.usdTotal,
            availableBorrowUsd,
            mintedCoin: borrowed.symbol,
            borrowToken: borrowed.address
          }
        ];
      });
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

const getMarketsData = async (chains) => {
  const marketsByVault = {};
  const perPage = 100;
  await Promise.all(
    chains.map(async (chain) => {
      try {
        let page = 1;
        while (true) {
          const data = await utils.getData(
            `https://prices.curve.finance/v1/lending/markets/${chain}?page=${page}&per_page=${perPage}`
          );
          if (!data?.data || data.data.length === 0) break;
          for (const market of data.data) {
            if (!market.vault) continue;
            marketsByVault[market.vault.toLowerCase()] = {
              ltv: market.max_ltv / 100,
              collateralTvlUsd:
                (market.collateral_balance_usd || 0) +
                (market.borrowed_balance_usd || 0),
              totalBorrowUsd: market.total_debt_usd,
              totalSupplyUsd:
                (market.collateral_balance_usd || 0) +
                (market.borrowed_balance_usd || 0)
            };
          }
          if (data.data.length < perPage) break;
          page++;
        }
      } catch (e) {
        console.error(`Failed to fetch market data for ${chain}:`, e);
      }
    })
  );
  return marketsByVault;
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

  const marketsByVault = await getMarketsData(chains);

  return lendingPools.map(pool => {
    const vaultAddress = pool.pool.split('-')[0].toLowerCase();
    const gaugeInfo = gaugesByAddress[vaultAddress] || {};
    const market = marketsByVault[vaultAddress];
    const isBorrowPool = !!pool.borrowToken;
    if (isBorrowPool && market === undefined) return null;
    return {
      ...pool,
      ...(!isBorrowPool && {
        apyReward: gaugeInfo.crvApy,
        rewardTokens: gaugeInfo.rewardTokens
      }),
      ...(isBorrowPool && market !== undefined && {
        tvlUsd: pool.availableBorrowUsd,
        totalSupplyUsd: market.totalSupplyUsd,
        totalBorrowUsd: market.totalBorrowUsd,
        borrowable: market.ltv > 0
      }),
      ...(isBorrowPool && market?.ltv !== undefined && { ltv: market.ltv })
    };
  }).filter(Boolean);
};

const main = async () => {
  return await fullLendingPoolDataWithGauges();
};


module.exports = {
  protocolId: '4321',
  apy: main,
};
