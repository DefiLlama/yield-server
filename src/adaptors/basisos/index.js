const sdk = require('@defillama/sdk');
const utils = require('../utils');

/**
 * @dev Fetches all vault addresses from the DataProvider contract.
 * @returns {Promise<object>} An object containing an array of vault addresses.
 */
async function getAllVaults() {
    const DATA_PROVIDER_ADDRESS = '0xDD5C8aB2E9F113b397ff2b8528C649bAEf24dF97'

    const vaults = await sdk.api.abi.call({
        target: DATA_PROVIDER_ADDRESS,
        abi: 'address[]:getAllVaults',
        chain: 'arbitrum',
    })

    return vaults
}

/**
 * @dev Fetches the total value locked (TVL) in a given vault.
 * @param {string} vaultAddress The address of the vault.
 * @returns {Promise<object>} An object containing the TVL.
 */
async function getTvl(vaultAddress) {
    const tvl = await sdk.api.abi.call({
        target: vaultAddress,
        abi: 'uint256:totalAssets',
        chain: 'arbitrum',
    })

    return tvl
}

/**
 * @dev Fetches the strategy address for a given vault.
 * @param {string} vaultAddress The address of the vault.
 * @returns {Promise<object>} An object containing the strategy address.
 */
async function getStrategyAddress(vaultAddress) {
    const strategy = await sdk.api.abi.call({
        target: vaultAddress,
        abi: 'address:strategy',
        chain: 'arbitrum',
    })

    return strategy
}

/**
 * @dev Fetches the product token address for a given strategy.
 * @param {string} strategyAddress The address of the strategy.
 * @returns {Promise<object>} An object containing the product token address.
 */
async function getProductToken(strategyAddress) {
    const product = await sdk.api.abi.call({
        target: strategyAddress.output,
        abi: 'address:product',
        chain: 'arbitrum',
    })

    return product
}

/**
 * @dev Fetches the asset token address for a given vault.
 * @param {string} vaultAddress The address of the vault.
 * @returns {Promise<object>} An object containing the asset token address.
 */
async function getAssetToken(vaultAddress) {
    const asset = await sdk.api.abi.call({
        target: vaultAddress,
        abi: 'address:asset',
        chain: 'arbitrum',
    })

    return asset
}

/**
 * @dev Fetches the symbol of a given token.
 * @param {string} tokenAddress The address of the token.
 * @returns {Promise<object>} An object containing the token symbol.
 */
async function getTokenSymbol(tokenAddress) {
    const symbol = await sdk.api.abi.call({
        target: tokenAddress.output,
        abi: 'string:symbol',
        chain: 'arbitrum',
    })

    return symbol
}

/**
 * @dev Fetches the decimal precision of a given asset token.
 * @param {string} assetAddress The address of the asset token.
 * @returns {Promise<object>} An object containing the decimal precision.
 */
async function getAssetDecimal(assetAddress) {
    const decimal = await sdk.api.abi.call({
        target: assetAddress.output,
        abi: 'uint8:decimals',
        chain: 'arbitrum',
    })

    return decimal
}

/**
 * @dev Fetches the hedge manager address for a given strategy.
 * @param {string} strategyAddress The address of the strategy.
 * @returns {Promise<object>} An object containing the hedge manager address.
 */
async function getHedgeManagerAddress(strategyAddress) {
    const hedgeManager = await sdk.api.abi.call({
        target: strategyAddress.output,
        abi: 'address:hedgeManager',
        chain: 'arbitrum',
    })

    return hedgeManager
}

/**
 * @dev Fetches the Hyperliquid agent address for a given hedge manager.
 * @param {string} hedgeManagerAddress The address of the hedge manager.
 * @returns {Promise<object>} An object containing the agent address.
 */
async function getAgentAddress(hedgeManagerAddress) {
    const agent = await sdk.api.abi.call({
        target: hedgeManagerAddress.output,
        abi: 'address:agent',
        chain: 'arbitrum',
    })

    return agent
}

/**
 * @dev Fetches the Hyperliquid position fees for a given agent for the last 24 hours.
 * @param {string} agentAddress The address of the agent.
 * @returns {Promise<object>} An object containing the fees data.
 */
async function getHyperliquidPositionFees(agentAddress){
    const params = {
        "type": 'userFunding',
        "user": agentAddress.output,
        "startTime": parseInt(Date.now() - 86400 * 1000), // now - 1d
        "endTime": parseInt(Date.now()) // now
    }

    const feesData = await utils.getData(
        'https://api.hyperliquid.xyz/info', query = params
    );

    return feesData
}

/**
 * @dev Calculates the APY base from the fees data and TVL.
 * @param {object} feesData The fees data object.
 * @param {number} tvl The total value locked in USD.
 * @returns {number} The APY base.
 */
async function getApyBase(feesData, tvl){
    const totalFees = feesData.reduce((acc, curr) => acc + Number(curr.delta.usdc), 0);
    const apyBase = totalFees / tvl;

    return apyBase * 365 * 100
}

/**
 * @dev Calculates the APY for each BasisOS vault.
 * @returns {Promise<Array<object>>} An array of pool objects, each containing APY and other relevant information.
 */
async function apy() {
  const vaults = await getAllVaults();
  const pools = [];

  for (const vault of vaults.output) {
    const tvl_in_asset = await getTvl(vault);

    const strategyAddress = await getStrategyAddress(vault);
    const productToken = await getProductToken(strategyAddress);
    const symbol = await getTokenSymbol(productToken);
    const assetToken = await getAssetToken(vault);
    const assetDecimal = await getAssetDecimal(assetToken);

    const hedgeManagerAddress = await getHedgeManagerAddress(strategyAddress);
    const agentAddress = await getAgentAddress(hedgeManagerAddress);
    const hyperliquidPositionFees = await getHyperliquidPositionFees(agentAddress);

    const tvl_in_usd = Number(tvl_in_asset.output) / 10 ** Number(assetDecimal.output);

    const apyBase = await getApyBase(hyperliquidPositionFees, tvl_in_usd);

    pools.push({
      pool: `${vault}-arbitrum`.toLowerCase(),
      symbol: utils.formatSymbol(symbol.output),
      project: 'basisos',
      chain: utils.formatChain('arbitrum'),
      tvlUsd: tvl_in_usd,
      underlyingTokens: [productToken.output, assetToken.output],
      apyBase: apyBase,
    });
  }

  return pools;
}

  
module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://basisos.org/vaults',
};