 const utils = require('../utils');
 const MOVEMENT_MAINNET_CONFIG = {
    nodeUrl: 'https://rpc.sentio.xyz/movement/v1',
    indexerUrl: 'https://indexer.mainnet.movementnetwork.xyz/v1/graphql',
    metagqlUrl: 'https://rwf3uyiewzdnhavtega3imkynm.appsync-api.us-east-1.amazonaws.com/graphql',
    metagqlApiKey: 'da2-lcrfa5vgu5dkdct5ddrckpilj4',
    sentioApiUrl: 'https://app.sentio.xyz/api/v1/graphql/solo-labs/canopy-multi-rewards-movement',
    sentioApiKey: '2zaRgewVuAxPACPzYUa1BrkSymZ76vdnV',
    // Contract addresses
    satayBaseAddress: '0xb10bd32b3979c9d04272c769d9ef52afbc6edc4bf03982a9e326b96ac25e7f2d',
    ichiRootAddress: '0x968a2429f2544882a1743c51128fdf876ff03a25287d618743bde5b84a4fc00e',
    viewExtension: '0x8319e13c9484581de1f54b2b59656280969b822f371fe471abb3d242bc5799e8',
    tokens: {
        MOVE: '0x000000000000000000000000000000000000000000000000000000000000000a',
        USDC: '0x83121c9f9b0527d1f056e21a950d6bf3b9e9e2e8353d0e95ccea726713cbea39',
        USDT: '0x447721a30109c662dde9c73a0c2c9c9c459fb5e5a9c92f03c50fa69737f5d08d',
        WETH: '0x908828f4fb0213d4034c3ded1630bbd904e8a3a6bf3c63270887f0b06653a376',
        WBTC: '0xb06f29f24dde9c6daeec1f0c9c9c459fb5e5a9c92f03c50fa69737f5d08d'
    }
    }; 
// GraphQL queries
const GET_CANOPY_METADATA = `
query GetCanopyMetadata {
canopyMetadata {
    id
    symbol
    tvl
    totalSupply
    totalAssets
    decimals
    underlyingToken
    APR
    rewardAPR
    totalAPR
    vaultType
    chainId
    isActive
    __typename
    }
}
`;
 const GET_GLOBAL_TOKENS = `
    query GetGlobalTokens {
    globalTokens {
        address
        coinAddress
        decimals
        displayName
        symbol
        price
        isStableCoin
        iconURL
        chainId
        __typename
        }
    }
    `;  
// Helper function to make GraphQL requests
async function makeGraphQLRequest(url, query, apiKey) {
    const superagent = require('superagent');
    const response = await superagent
        .post(url)
        .set('Content-Type', 'application/json')
        .set('x-api-key', apiKey)
        .send({ query });
    return response.body.data;
}
// Helper function to get on-chain vault data
async function getOnChainVaultData(nodeUrl, satayBaseAddress) {
    try {
        const viewFunctionUrl = `${nodeUrl}/view`;
        const payload = {
            function: `${satayBaseAddress}::vault::vaults_view`,
            type_arguments: [],
            arguments: []
        };  
        const response = await utils.getData(viewFunctionUrl, payload);
        return response;
    } catch (error) {
        console.error('Error fetching on-chain vault data:', error);
        return [];
    }
}
// Helper function to get Liquidswap vault data
async function getLiquidswapVaultData(nodeUrl, viewExtension) {
    try {
        const viewFunctionUrl = `${nodeUrl}/view`;
        const payload = {
            function: `${viewExtension}::view_extensions::get_vaults_info`,
            type_arguments: [],
            arguments: []
        };
        const response = await utils.getData(viewFunctionUrl, payload);
        return response;
    } catch (error) {
        console.error('Error fetching Liquidswap vault data:', error);
        return [];
    }
}

// Helper function to format vault type for poolMeta
function formatVaultType(vaultType) {
  const vaultTypeMap = {
    'ichi_vault_liquidswap': 'Liquidswap Vault',
    'satay_echelon': 'Satay Echelon',
    'satay_moveposition': 'Satay MovePosition',
    'satay_layerbank': 'Satay LayerBank',
    'satay_ls05': 'Satay LS05',
    'satay_meridian_stable_pool': 'Satay Meridian',
    'cornucopia_deployer': 'Cornucopia Deployer'
  };
  
  return vaultTypeMap[vaultType] || vaultType;
}

// Helper function to get underlying tokens based on vault type
function getUnderlyingTokens(vaultType, symbol, config) {
  const tokens = [];
  
  if (symbol.includes('-')) {
    // LP tokens - split by dash
    const symbols = symbol.split('-');
    symbols.forEach(sym => {
      const tokenAddress = config.tokens[sym.trim()];
      if (tokenAddress) {
        tokens.push(tokenAddress);
      }
    });
  } else {
    // Single token
    const tokenAddress = config.tokens[symbol.trim()];
    if (tokenAddress) {
      tokens.push(tokenAddress);
    }
  }
  
  return tokens;
}

// Main function to get all pools
const apy = async () => {
  try {
    // Fetch metadata and token prices
    const [metadataResponse, tokensResponse] = await Promise.all([
      makeGraphQLRequest(
        MOVEMENT_MAINNET_CONFIG.metagqlUrl,
        GET_CANOPY_METADATA,
        MOVEMENT_MAINNET_CONFIG.metagqlApiKey
      ),
      makeGraphQLRequest(
        MOVEMENT_MAINNET_CONFIG.metagqlUrl,
        GET_GLOBAL_TOKENS,
        MOVEMENT_MAINNET_CONFIG.metagqlApiKey
      )
    ]);

    const canopyMetadata = metadataResponse?.canopyMetadata || [];
    const globalTokens = tokensResponse?.globalTokens || [];

    // Create token price map
    const tokenPriceMap = {};
    globalTokens.forEach(token => {
      tokenPriceMap[token.symbol] = token.price;
      tokenPriceMap[token.address] = token.price;
    });

    // Filter active vaults on Movement mainnet (chainId 126)
    const activeVaults = canopyMetadata.filter(vault => 
      vault.isActive && vault.chainId === 126 && vault.tvl > 10000
    );

    // Convert to DefiLlama pool format
    const pools = activeVaults.map(vault => {
      const underlyingTokens = getUnderlyingTokens(
        vault.vaultType, 
        vault.symbol, 
        MOVEMENT_MAINNET_CONFIG
      );

      // Create pool identifier
      const poolId = `${vault.id}-movement`.toLowerCase();

      // Base pool object
      const pool = {
        pool: poolId,
        chain: 'Movement',
        project: 'canopy',
        symbol: vault.symbol,
        tvlUsd: vault.tvl,
        underlyingTokens,
        poolMeta: formatVaultType(vault.vaultType),
        url: `https://www.canopyhub.xyz/vault/${vault.id}`,
      };

      // Add APY data
      if (vault.APR > 0 && vault.rewardAPR > 0) {
        pool.apyBase = vault.APR;
        pool.apyReward = vault.rewardAPR;
      } else if (vault.totalAPR > 0) {
        pool.apy = vault.totalAPR;
      } else if (vault.APR > 0) {
        pool.apyBase = vault.APR;
      } else if (vault.rewardAPR > 0) {
        pool.apyReward = vault.rewardAPR;
      }

      // Add reward tokens if available (placeholder - would need actual reward token addresses)
      if (vault.rewardAPR > 0) {
        pool.rewardTokens = [MOVEMENT_MAINNET_CONFIG.tokens.MOVE]; // Assuming MOVE is the reward token
      }

      return pool;
    });

    // Filter out pools with invalid data
    const validPools = pools.filter(pool => 
      pool.tvlUsd > 0 && 
      pool.underlyingTokens.length > 0 &&
      (pool.apyBase > 0 || pool.apyReward > 0 || pool.apy > 0)
    );

    console.log(`Found ${validPools.length} valid Canopy pools`);
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