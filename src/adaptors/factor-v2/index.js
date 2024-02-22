const vaults = require('./vaults');
const { getTvl, getApr } = require('./shared');

async function getSingleYieldVaultAPY() {
    const poolData = await Promise.all(
        vaults.map(async (vault) => {
            const project = 'factor-v2';
            const chain = 'arbitrum';
            const pool = `${vault.poolAddress}-${chain}`.toLowerCase();
            const url = `https://app.factor.fi/vault/${vault.poolAddress}`;
            const symbol = vault.symbol;

            const [tvlUsd, apyBase] = await Promise.all([
                getTvl(vault.poolAddress, vault.underlyingToken, vault.strategy),
                getApr(vault.poolAddress, vault.underlyingToken, vault.strategy),
            ]);

            const data = {
                pool,
                chain,
                project,
                symbol,
                tvlUsd,
                apyBase,
                underlyingTokens: [vault.underlyingToken],
                url,
            };

            return data;
        })
    );

    return poolData;
}

module.exports = {
    timetravel: false,
    apy: getSingleYieldVaultAPY,
};
