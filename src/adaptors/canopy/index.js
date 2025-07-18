const utils = require('../utils');

const MOVEMENT_MAINNET_CONFIG = {
  chainId: 126,
  metagqlUrl: 'https://rwf3uyiewzdnhavtega3imkynm.appsync-api.us-east-1.amazonaws.com/graphql',
  metagqlApiKey: 'da2-lcrfa5vgu5dkdct5ddrckpilj4',
  
  // Contract addresses
  stakeAddress: '0x113a1769acc5ce21b5ece6f9533eef6dd34c758911fa5235124c87ff1298633b',
  
  // Token addresses (Movement Mainnet)
  tokens: {
    MOVE: '0x000000000000000000000000000000000000000000000000000000000000000a',
    USDC: '0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39',
    USDT: '0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d',
    WETH: '0x908828f4fb0213d4034c3ded1630bbd904e8a3a6bf3c63270887f0b06653a376',
    WBTC: '0xb06f29f24dde9c6daeec1f0c9c9c459fb5e5a9c92f03c50fa69737f5d08d',
    EZETH: '0x2f6af255328fe11b88d840d1e367e946ccd16bd7ebddd6ee7e2ef9f7ae0c53ef',
    RSETH: '0x51ffc9885233adf3dd411078cad57535ed1982013dc82d9d6c433a55f2e0035d',
    STBTC: '0x95c0fd13373299ada1b9f09ff62473ab8b3908e6a30011730210c141dffdc990'
  }
};

// Correct GraphQL query matching the actual structure
const GET_CANOPY_METADATA = `
  query GetCanopyMetadata($chainId: Int!) {
    listCanopyMetadata(filter: { chainId: { eq: $chainId } }) {
      items {
        id
        chainId
        networkAddress
        displayName
        investmentType
        networkType
        riskScore
        priority
        isHidden
        description
        iconURL
        labels
        rewardPools
        additionalMetadata {
          item
          key
        }
        paused
        token0
        token1
        allowToken0
        allowToken1
        tvl
        totalSupply
        token0Balance
        token1Balance
        decimals0
        decimals1
        apr
        rewardApr
      }
    }
  }
`;

// Helper function to make GraphQL requests
async function makeGraphQLRequest(url, query, variables, apiKey) {
  try {
    const payload = JSON.stringify({ 
      query,
      variables 
    });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Cache-Control': 'public, max-age=3600'
      },
      body: payload,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data.data;
  } catch (error) {
    console.error('GraphQL request failed:', error);
    throw error;
  }
}

// Helper function to format vault type for poolMeta
function formatVaultType(investmentType) {
  const vaultTypeMap = {
    'ichi_vault_liquidswap': 'Liquidswap Vault',
    'satay_echelon': 'Satay Echelon',
    'satay_moveposition': 'Satay MovePosition',
    'satay_layerbank': 'Satay LayerBank',
    'satay_ls05': 'Satay LS05',
    'satay_meridian_stable_pool': 'Satay Meridian',
    'cornucopia_deployer': 'Cornucopia Deployer'
  };
  
  return vaultTypeMap[investmentType] || investmentType;
}

// Helper function to get underlying tokens
function getUnderlyingTokens(vault, config) {
  const tokens = [];
  
  if (vault.token0 && vault.token0 !== '0x0') {
    tokens.push(vault.token0);
  }
  
  if (vault.token1 && vault.token1 !== '0x0') {
    tokens.push(vault.token1);
  }
  
  // If no specific tokens found, try to map from display name
  if (tokens.length === 0 && vault.displayName) {
    const displayName = vault.displayName.toUpperCase();
    
    // Check for LP tokens (contains dash or common patterns)
    if (displayName.includes('-') || displayName.includes('LP')) {
      const symbols = displayName.split(/[-_\s]/);
      symbols.forEach(symbol => {
        const cleanSymbol = symbol.replace(/[^A-Z]/g, '');
        if (config.tokens[cleanSymbol]) {
          tokens.push(config.tokens[cleanSymbol]);
        }
      });
    } else {
      // Single token
      Object.keys(config.tokens).forEach(symbol => {
        if (displayName.includes(symbol)) {
          tokens.push(config.tokens[symbol]);
        }
      });
    }
  }
  
  return tokens;
}

// Helper function to get reward tokens
function getRewardTokens(vault, config) {
  const rewardTokens = [];
  
  // If rewardPools exist, use them
  if (vault.rewardPools && vault.rewardPools.length > 0) {
    vault.rewardPools.forEach(pool => {
      if (pool && pool !== '0x0') {
        rewardTokens.push(pool);
      }
    });
  }
  
  // Default to MOVE token if no specific reward tokens and there's reward APR
  if (rewardTokens.length === 0 && vault.rewardApr > 0) {
    rewardTokens.push(config.tokens.MOVE);
  }
  
  return rewardTokens;
}

// Main function to get all pools
const apy = async () => {
  try {
    console.log('Fetching Canopy metadata...');
    
    // Fetch metadata for Movement mainnet (chainId 126)
    const metadataResponse = await makeGraphQLRequest(
      MOVEMENT_MAINNET_CONFIG.metagqlUrl,
      GET_CANOPY_METADATA,
      { chainId: MOVEMENT_MAINNET_CONFIG.chainId },
      MOVEMENT_MAINNET_CONFIG.metagqlApiKey
    );

    const canopyMetadata = metadataResponse?.listCanopyMetadata?.items || [];
    console.log(`Found ${canopyMetadata.length} total vaults`);

    // Filter active vaults with sufficient TVL
    const activeVaults = canopyMetadata.filter(vault => {
      const isActive = !vault.paused && !vault.isHidden;
      const hasSufficientTVL = vault.tvl > 10000; // DefiLlama minimum
      const hasAPY = (vault.apr > 0) || (vault.rewardApr > 0);
      
      return isActive && hasSufficientTVL && hasAPY;
    });

    console.log(`Found ${activeVaults.length} active vaults with sufficient TVL`);

    // Convert to DefiLlama pool format
    const pools = activeVaults.map(vault => {
      const underlyingTokens = getUnderlyingTokens(vault, MOVEMENT_MAINNET_CONFIG);
      const rewardTokens = getRewardTokens(vault, MOVEMENT_MAINNET_CONFIG);
      
      // Create pool identifier using network address
      const poolId = `${vault.networkAddress}-movement`.toLowerCase();
      
      // Calculate APY components
      const baseAPY = vault.apr ? vault.apr / 100 : 0; // Convert basis points to percentage
      const rewardAPY = vault.rewardApr || 0; // Already in decimal format
      const totalAPY = baseAPY + rewardAPY;
      
      // Base pool object
      const pool = {
        pool: poolId,
        chain: utils.formatChain('movement'),
        project: 'canopy',
        symbol: utils.formatSymbol(vault.displayName),
        tvlUsd: vault.tvl,
        underlyingTokens,
        poolMeta: formatVaultType(vault.investmentType),
        url: `https://www.canopyhub.xyz/vault/${vault.id}`,
      };

      // Add APY data based on what's available
      if (baseAPY > 0 && rewardAPY > 0) {
        pool.apyBase = baseAPY;
        pool.apyReward = rewardAPY;
      } else if (totalAPY > 0) {
        pool.apy = totalAPY;
      }

      // Add reward tokens if available
      if (rewardTokens.length > 0) {
        pool.rewardTokens = rewardTokens;
      }

      return pool;
    });

    // Final validation using utils
    const validPools = pools.filter(pool => {
      const hasValidTVL = pool.tvlUsd > 0;
      const hasValidAPY = pool.apyBase > 0 || pool.apyReward > 0 || pool.apy > 0;
      const hasUnderlyingTokens = pool.underlyingTokens.length > 0;
      
      return hasValidTVL && hasValidAPY && hasUnderlyingTokens && utils.keepFinite(pool);
    });

    console.log(`Returning ${validPools.length} valid pools for DefiLlama`);
    
    return validPools;

  } catch (error) {
    console.error('Error in Canopy adapter:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.canopyhub.xyz/explore',
};