const utils = require('../utils');

const API_BASE = 'https://neura-vault-backend-production.up.railway.app';
const VAULT_ADDRESS = "0x69C96a82b8534aae25b43644D5964c6b8F215676";
const USDT0_ADDRESS = "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb";
const CHAIN = 'hyperliquid';

const poolsFunction = async () => {
    try {
        // Fetch vault data from REST API
        const response = await utils.getData(
            `${API_BASE}/api/neura-vault/vaults/${VAULT_ADDRESS}`
        );

        if (!response.success || !response.data) {
            console.error('No vault data returned from API');
            return [];
        }

        const vaultData = response.data;

        // Validate required nested objects
        if (!vaultData.currentData || !vaultData.apy) {
            console.error('Incomplete vault data structure from API');
            return [];
        }

        // Extract TVL from currentData.totalAssets (USDT0 has 6 decimals)
        const tvlUsd = Number(vaultData.currentData.totalAssets) / 1e6;

        // APY values are already in percentage format from the REST API
        const apy = vaultData.apy.apy || 0;
        const apy7d = vaultData.apy.apy7d || 0;
        const apy30d = vaultData.apy.apy30d || 0;

        // Use 7-day APY as the primary APY (more stable than 1-day)
        const primaryAPY = apy7d > 0 ? apy7d : apy;

        const pool = {
            pool: `${VAULT_ADDRESS}-${CHAIN}`.toLowerCase(),
            chain: utils.formatChain(CHAIN),
            project: 'neura-vaults',
            symbol: utils.formatSymbol('USDT0'),
            tvlUsd: tvlUsd,
            apy: primaryAPY,
            apyBase: primaryAPY, // All APY comes from lending protocols
            apyReward: 0, // No additional reward tokens
            apyMean30d: apy30d, // 30-day average APY for historical context
            underlyingTokens: [USDT0_ADDRESS],
            poolMeta: 'AI-Powered Yield Optimization',
            url: 'https://neuravaults.xyz/',
        };

        return [pool];
    } catch (error) {
        console.error('Error fetching Neura Vaults data:', error.message);
        return [];
    }
};

module.exports = {
    timetravel: false,
    apy: poolsFunction,
    url: 'https://neuravaults.xyz/',
};