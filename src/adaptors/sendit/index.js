const axios = require('axios');
const utils = require('../utils');

const API_BASE = 'https://backend.sendit.fun/api';
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

const fetchAllVerifiedMarketPools = async () => {
  try {
    const response = await axios.get(`${API_BASE}/accounts/verified-markets/pools`);
    return response.data?.data?.pools || [];
  } catch (error) {
    return [];
  }
};

const fetchSolVaults = async () => {
  try {
    const response = await axios.get(`${API_BASE}/sol-vaults`);
    // Return the full response data to include solPrice
    return response.data || { vaults: [], solPrice: null };
  } catch (error) {
    return { vaults: [], solPrice: null };
  }
};

const fetchSingleSidedVaults = async () => {
  try {
    const response = await axios.get(`${API_BASE}/single-sided-vaults`);
    const vaults = response.data?.vaults || [];
    return Array.isArray(vaults) ? vaults : [];
  } catch (error) {
    return [];
  }
};

const formatSolReservePool = (market, poolData) => {
  const solReserve = poolData.solReserve;
  const nonSolReserve = poolData.nonSolReserve;
  const tokenSymbol = nonSolReserve?.metadata?.symbol || 'UNKNOWN';
  
  // Use supplyInterest which is already in decimal format (e.g., 0.469 = 46.9%)
  const supplyApr = Number(solReserve?.supplyInterest || 0) * 100;
  
  // Extract incentive APR from the object structure
  let apyReward = 0;
  if (poolData.incentiveApr && poolData.incentiveApr.currentAPR) {
    apyReward = Number(poolData.incentiveApr.currentAPR) * 100;
  }
  
  // Calculate TVL following DefiLlama's standard for lending protocols
  const totalSupplyUsd = Number(solReserve?.totalSupplyUsd || 0);
  const totalBorrowUsd = Number(solReserve?.totalBorrowUsd || 0);
  const tvlUsd = totalSupplyUsd - totalBorrowUsd;
  
  // Get borrow APR if available
  const borrowApr = Number(solReserve?.borrowInterest || 0) * 100;
  
  return {
    pool: `${market.lendingMarketId}-solana`.toLowerCase(),
    chain: utils.formatChain('solana'),
    project: 'sendit',
    symbol: 'SOL',
    poolMeta: `SOL in ${tokenSymbol} market`,
    tvlUsd: tvlUsd,
    apyBase: supplyApr,
    apyReward: apyReward > 0 ? apyReward : null,
    rewardTokens: nonSolReserve?.mintAddress ? [nonSolReserve.mintAddress] : [],
    underlyingTokens: [WSOL_MINT],
    url: `https://sendit.fun/market/${market.lendingMarketId}`,
    totalSupplyUsd: totalSupplyUsd,
    totalBorrowUsd: totalBorrowUsd,
    apyBaseBorrow: borrowApr > 0 ? borrowApr : null
  };
};

const getVaultCategoryName = (vaultAddress) => {
  const vaultNames = {
    '7EyBhsXnLUWTj5wKWmeGDDDJXcWRXiUa2YuFbwCQrNH2': 'SOL Blue Chip Vault',
    '5iNq4uB73mjkJKru7g9FSXk3biA2jnvP6McYn6bezazT': 'SOL Mid Cap Vault',
    '6nVHK1wcg7hJVaLct7A5KJtjgi5XhSrgEFbQvoagtHbQ': 'SOL Small Cap Vault'
  };
  
  return vaultNames[vaultAddress] || 'SOL Vault';
};

const formatSolVaultPool = (vault, solPrice) => {
  // Calculate average APR from deployed positions
  let avgApr = 0;
  if (vault?.deployedPositions && vault.deployedPositions.length > 0) {
    const totalValue = vault.deployedPositions.reduce((sum, pos) => sum + (pos.depositedValueSol || 0), 0);
    avgApr = vault.deployedPositions.reduce((sum, pos) => 
      sum + ((pos.apr || 0) * (pos.depositedValueSol || 0) / totalValue), 0
    );
  }
  
  const tvlUsd = Number(vault?.totalValueLockedSol || 0) * solPrice;
  const vaultName = getVaultCategoryName(vault?.vaultAddress);
  
  return {
    pool: `${vault?.vaultAddress}-solana`.toLowerCase(),
    chain: utils.formatChain('solana'),
    project: 'sendit',
    symbol: 'SOL',
    poolMeta: vaultName,
    tvlUsd: tvlUsd,
    apyBase: avgApr * 100, // Convert to percentage
    underlyingTokens: [WSOL_MINT],
    url: 'https://sendit.fun/earn'
  };
};

const formatSingleSidedVaultPool = (vault) => {
  const tokenSymbol = vault?.tokenSymbol || 'UNKNOWN';
  
  return {
    pool: `${vault?.vaultAddress}-solana`.toLowerCase(),
    chain: utils.formatChain('solana'),
    project: 'sendit',
    symbol: tokenSymbol,
    poolMeta: `${tokenSymbol} Vault`,
    tvlUsd: Number(vault?.tvlBreakdown?.usd?.totalAssets || 0),
    apyBase: vault?.apr ? Number(vault.apr) : 0,  // apr is already in percentage
    underlyingTokens: vault?.depositTokenMint ? [vault.depositTokenMint] : [],
    url: 'https://sendit.fun/earn'
  };
};

const poolsFunction = async () => {
  const pools = [];
  
  try {
    const [verifiedMarketPools, solVaultsData, singleSidedVaults] = await Promise.all([
      fetchAllVerifiedMarketPools(),
      fetchSolVaults(),
      fetchSingleSidedVaults()
    ]);
    
    // Extract SOL price and vaults from the response
    const solPrice = solVaultsData?.solPrice || 195; // Fallback to 195 if no price
    const solVaults = solVaultsData?.vaults || [];
    
    // Process verified market pools
    verifiedMarketPools.forEach(poolData => {
      if (poolData && poolData.solReserve) {
        try {
          const pool = formatSolReservePool(
            { lendingMarketId: poolData.marketAddress }, 
            poolData
          );
          if (pool) {
            pools.push(pool);
          }
        } catch (err) {
          // Silently skip pools that fail to format
        }
      }
    });
    
    solVaults.forEach(vault => {
      try {
        const pool = formatSolVaultPool(vault, solPrice);
        if (pool) {
          pools.push(pool);
        }
      } catch (err) {
        // Silently skip vaults that fail to format
      }
    });
    
    singleSidedVaults.forEach(vault => {
      try {
        const pool = formatSingleSidedVaultPool(vault);
        if (pool) {
          pools.push(pool);
        }
      } catch (err) {
        // Silently skip vaults that fail to format
      }
    });
  } catch (error) {
    // Return whatever pools we were able to collect
  }
  
  const validPools = pools.filter(pool => 
    pool && 
    pool.project === 'sendit' && 
    typeof pool.tvlUsd === 'number' &&
    !isNaN(pool.tvlUsd)
  );
  
  return validPools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://sendit.fun'
};
