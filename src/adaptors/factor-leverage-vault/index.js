const { request, gql } = require('graphql-request');
const { getCoinPriceMap } = require('./shared');
const vaults = require('./vaults');

async function getPairTvlMap(vaults) {
    const leverageSubgraphUrl =
        'https://api.thegraph.com/subgraphs/name/dimasriat/factor-leverage-vault';

    const leverageSubgraphQuery = gql`
        {
            leverageVaultPairStates {
                id
                assetBalanceRaw
                assetTokenAddress
                debtBalanceRaw
                debtTokenAddress
            }
        }
    `;

    const { leverageVaultPairStates } = await request(
        leverageSubgraphUrl,
        leverageSubgraphQuery
    );

    const tokenAddresses = new Set(
        leverageVaultPairStates.flatMap((pair) => [
            pair.assetTokenAddress.toLowerCase(),
            pair.debtTokenAddress.toLowerCase(),
        ])
    );
    const coinPriceMap = await getCoinPriceMap([...tokenAddresses]);

    const tvlMap = {};

    leverageVaultPairStates.forEach((pair) => {
        const assetAddress = pair.assetTokenAddress.toLowerCase();
        const debtAddress = pair.debtTokenAddress.toLowerCase();
        const assetAmount = Number(pair.assetBalanceRaw);
        const debtAmount = Number(pair.debtBalanceRaw);

        const assetAmountFmt = assetAmount / 10 ** 18;
        const debtAmountFmt = debtAmount / 10 ** 18;

        const assetAmountUsd =
            assetAmountFmt * coinPriceMap[assetAddress].price;
        const debtAmountUsd = debtAmountFmt * coinPriceMap[debtAddress].price;
        const netValueUsd = assetAmountUsd - debtAmountUsd;

        const mapId = `${assetAddress}-${debtAddress}`.toLowerCase();
        tvlMap[mapId] = netValueUsd;
    });

    vaults.forEach((vault) => {
        const mapId = `${vault.assetAddress}-${vault.debtAddress}`.toLowerCase();
        if (tvlMap[mapId] === undefined) {
            tvlMap[mapId] = 0;
        }
    });

    return tvlMap;
}

function createPoolData({
    protocol,
    market,
    assetAddress,
    assetSymbol,
    debtAddress,
    debtSymbol,
    vaultAddress,
    tvlUsd,
    apyBase,
}) {
    const project = 'factor-leverage-vault';
    const chain = 'arbitrum';
    const pool = `${protocol}-${market}-${chain}`.toLowerCase();
    const url = `https://app.factor.fi/studio/vault-leveraged/${protocol}/${market}/open-pair?asset=${assetAddress}&debt=${debtAddress}&vault=${vaultAddress}`;
    const symbol = `${protocol} ${assetSymbol}/${debtSymbol}`;
    const underlyingTokens = [assetAddress, debtAddress];
    return {
        pool,
        chain,
        project,
        symbol,
        tvlUsd,
        apyBase,
        underlyingTokens,
        url,
    };
}

async function getLeverageVaultAPY() {
    const tvlMap = await getPairTvlMap(vaults);
    const poolData = await Promise.all(
        vaults.map(async (vault, index) => {
            // const [tvlUsd, apyBase] = await Promise.all([
            //     getTvl(vault.poolAddress, vault.underlyingToken, vault.strategy),
            //     getApr(vault.poolAddress, vault.underlyingToken, vault.strategy),
            // ]);

            // const tvlUsd = await getTvl(
            //     vault.pool,
            //     vault.assetAddress,
            //     vault.debtAddress
            // );

            const tvlUsd =
                tvlMap[
                    `${vault.assetAddress}-${vault.debtAddress}`.toLowerCase()
                ] ?? 0;
            const apyBase = 0;

            return createPoolData({
                protocol: vault.protocol,
                market: vault.market,
                assetAddress: vault.assetAddress,
                assetSymbol: vault.assetSymbol,
                debtAddress: vault.debtAddress,
                debtSymbol: vault.debtSymbol,
                vaultAddress: vault.pool,
                tvlUsd,
                apyBase,
            });
        })
    );

    return poolData;
}

module.exports = {
    timetravel: false,
    apy: getLeverageVaultAPY,
};
