const utils = require('../utils');
const sdk = require('@defillama/sdk');

const VAULTS_API = 'https://api.maxshot.ai/vaults';

// Chain ID to chain name mapping
const CHAIN_ID_TO_NAME = {
  1: 'ethereum',
  10: 'optimism',
  8453: 'base',
  9745: 'plasma',
  42161: 'arbitrum',
};

// Multi-chain vault addresses (when chainIds length > 1)
const MULTI_CHAIN_VAULT_ADDRESSES = {
  oUSDT0: '0xd507d9D4F356B84e3EEEc33eeDef85BB57f59CfB',
  oUSDC: '0xCe0F05f19845CdE36058CcFb53C755Ab8739b880',
};

const apy = async () => {
  const response = await utils.getData(VAULTS_API);
  const vaults = response.data;

  // First pass: collect all pool info and prepare RPC call inputs
  const poolInfos = [];
  for (const vault of vaults) {
    const chainIds = vault.chainIds.split(',').map(Number);
    const isMultiChain = chainIds.length > 1;

    for (const chainId of chainIds) {
      const chainName = CHAIN_ID_TO_NAME[chainId];
      if (!chainName) continue;

      // Determine pool address: use multi-chain address if chainIds > 1
      let poolAddress = vault.address;
      if (isMultiChain && MULTI_CHAIN_VAULT_ADDRESSES[vault.symbol]) {
        poolAddress = MULTI_CHAIN_VAULT_ADDRESSES[vault.symbol];
      }

      poolInfos.push({
        vault,
        chainId,
        chainName,
        poolAddress,
        isMultiChain,
      });
    }
  }

  // Parallel RPC calls for asset() and totalSupply() (for multi-chain vaults)
  const rpcPromises = poolInfos.map(async (info) => {
    const { chainName, poolAddress, isMultiChain } = info;

    // Always fetch asset()
    const assetPromise = sdk.api.abi.call({
      target: poolAddress,
      abi: 'function asset() public view returns (address)',
      chain: chainName,
    });

    // For multi-chain vaults, also fetch totalSupply()
    let totalSupplyPromise = null;
    if (isMultiChain) {
      totalSupplyPromise = sdk.api.abi.call({
        target: poolAddress,
        abi: 'function totalSupply() public view returns (uint256)',
        chain: chainName,
      });
    }

    const [assetResult, totalSupplyResult] = await Promise.all([
      assetPromise,
      totalSupplyPromise,
    ]);

    return {
      underlyingToken: assetResult.output,
      totalSupply: totalSupplyResult ? totalSupplyResult.output : null,
    };
  });

  const rpcResults = await Promise.all(rpcPromises);

  // Build final pools array
  const pools = poolInfos.map((info, index) => {
    const { vault, chainName, poolAddress, isMultiChain } = info;
    const { underlyingToken, totalSupply } = rpcResults[index];

    // Convert netApy24h from 1e18 to percentage
    const apyValue = (Number(vault.netApy24h) / 1e18) * 100;

    // Calculate tvlUsd using BigInt for precision
    let tvlUsd;
    if (isMultiChain && totalSupply !== null) {
      const totalSharesBN = BigInt(totalSupply);
      const exchangeRateBN = BigInt(vault.exchangeRate);
      const scale = 10n ** (18n + BigInt(vault.assetDecimals));
      tvlUsd = Number((totalSharesBN * exchangeRateBN) / scale);
    } else {
      tvlUsd = Number(vault.totalValue) / 1e18;
    }

    // Calculate fee percentage from feeRate
    const feePercentage = (Number(vault.feeRate) / 1e18) * 100;

    return {
      pool: `${poolAddress.toLowerCase()}-${chainName}`,
      chain: utils.formatChain(chainName),
      project: 'maxshot',
      symbol: utils.formatSymbol(vault.symbol),
      tvlUsd,
      apyBase: apyValue,
      underlyingTokens: [underlyingToken],
      url: `https://app.maxshot.ai/#/earn/${vault.address}`,
      poolMeta: `Fee: ${feePercentage}%`,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.maxshot.ai',
};
