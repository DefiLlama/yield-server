const { request, gql } = require('graphql-request');

const yieldnestGatewayUrl = 'https://gateway.yieldnest.finance/api/v1/graphql';
const yieldnestRestakePoolBaseUrl = 'https://app.yieldnest.finance/restake/';
const chainIdToName = {
  1: 'Ethereum',
  56: 'Binance',
};
const yieldnestSummaryQuery = gql`
{
  getLRTsData(networkType: mainnet) {
    tokens {
      token
      blockchains {
        chainId
        apr {
          apr7d
          restaking7dApr
        }
        contract_details {
          tokenAddress
        }
        tvl {
          value_usd
        }
      }
    }
  }
}`

const yieldnestUnderlyingAssetsQuery = gql`
query lrt($chainId: Int!, $token: TOKENS!) {
  getAPRLRT(chainId: $chainId, token: $token) {
    underlyingAssets {
      address
    }
  }
}`

const FALLBACK_UNDERLYING = {
  ynETHx: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
  ynETH: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
  ynRWAx: ['coingecko:usd-coin'],
  ynLSDe: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
  ynUSDx: ['coingecko:usd-coin'],
  ynBNBx: ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'],
  STAK: ['0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'],
  YND: ['coingecko:yieldnest'],
  veYND: ['coingecko:yieldnest'],
  sdYND: ['coingecko:yieldnest'],
  ynBNB: ['0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'],
  ynBTCk: ['coingecko:bitcoin'],
  ynBfBTCk: ['coingecko:bitcoin'],
};

const getUnderlyingAssets = async (chainId, token) => {
  try {
    const data = await request(yieldnestGatewayUrl, yieldnestUnderlyingAssetsQuery, { chainId, token });
    const assets = data.getAPRLRT.underlyingAssets.map((asset) => asset.address);
    if (assets.length > 0) return assets;
    return FALLBACK_UNDERLYING[token] || [];
  } catch (error) {
    return FALLBACK_UNDERLYING[token] || [];
  }
}

const apy = async () => {
  const data = await request(yieldnestGatewayUrl, yieldnestSummaryQuery);
  const tokens = data.getLRTsData.tokens;

  const pools = await Promise.all(tokens.map(async (token) => {
    const blockchainData = token.blockchains[0];
    if (!blockchainData) return;
    const chain = chainIdToName[blockchainData.chainId];
    if (!chain) return;
    const address = blockchainData.contract_details.tokenAddress;
    const symbol = token.token;
    const decimals = 18;
    const apy = blockchainData.apr.apr7d + blockchainData.apr.restaking7dApr;
    const tvl = blockchainData.tvl.value_usd;
    const underlyingAssets = await getUnderlyingAssets(blockchainData.chainId, token.token);
    return {
      pool: `${address}-${chain}`.toLowerCase(),
      chain: chain,
      project: 'yieldnest',
      symbol: symbol,
      tvlUsd: tvl,
      apy: apy,
      underlyingTokens: underlyingAssets,
      url: `${yieldnestRestakePoolBaseUrl}${symbol}`,
    };
  }));

  return pools;
};

module.exports = { timetravel: false, apy };
