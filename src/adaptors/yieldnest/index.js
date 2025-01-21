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

const getUnderlyingAssets = async (chainId, token) => {
  try {
    const data = await request(yieldnestGatewayUrl, yieldnestUnderlyingAssetsQuery, { chainId, token });

    return data.getAPRLRT.underlyingAssets.map((asset) => asset.address);
  } catch (error) {
    return [];
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
