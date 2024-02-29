const { request, gql } = require('graphql-request');
const { getCoinPriceMap } = require('./shared');
const vaults = require('./vaults');
const {
    AaveV3LeverageVaultHelper,
    DummyLeverageVaultHelper,
    CompoundV3LeverageVaultHelper,
} = require('./adapters');

class FactorLeverageVaultHelper {
    constructor(vaults) {
        this._vaults = vaults;
        this._pairTvlMap = undefined;
        this._initialized = false;
        this._marketAdapterMap = {
            facAAVEv3: new AaveV3LeverageVaultHelper(vaults),
            facCompound: new CompoundV3LeverageVaultHelper(
                '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA'
            ),
            facCompoundNative: new CompoundV3LeverageVaultHelper(
                '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf'
            ),
            dummy: new DummyLeverageVaultHelper(vaults),
        };
    }

    async initialize() {
        await Promise.all([
            this._initializeTvlPairMap(),
            ...Object.values(this._marketAdapterMap).map((adapter) =>
                adapter.initialize()
            ),
        ]);
        this._initialized = true;
    }

    createPoolsData() {
        const poolsData = this._vaults.map((vault) => {
            return this._createPoolData({
                protocol: vault.protocol,
                market: vault.market,
                assetAddress: vault.assetAddress,
                assetSymbol: vault.assetSymbol,
                debtAddress: vault.debtAddress,
                debtSymbol: vault.debtSymbol,
                vaultAddress: vault.pool,
            });
        });

        return poolsData;
    }

    // ================== Private Methods ================== //

    async _initializeTvlPairMap() {
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
            const debtAmountUsd =
                debtAmountFmt * coinPriceMap[debtAddress].price;
            const netValueUsd = assetAmountUsd - debtAmountUsd;

            const mapId = `${assetAddress}-${debtAddress}`.toLowerCase();
            tvlMap[mapId] = netValueUsd;
        });

        vaults.forEach((vault) => {
            const mapId =
                `${vault.assetAddress}-${vault.debtAddress}`.toLowerCase();
            if (tvlMap[mapId] === undefined) {
                tvlMap[mapId] = 0;
            }
        });

        this._pairTvlMap = tvlMap;
    }

    _getAdapterByMarket(market) {
        const adapter = this._marketAdapterMap[market];
        if (!adapter) {
            // throw new Error(`No adapter found for protocol ${protocol}`);
            return this._marketAdapterMap['dummy'];
        }
        return adapter;
    }

    _createPoolData({
        protocol,
        market,
        assetAddress,
        assetSymbol,
        debtAddress,
        debtSymbol,
        vaultAddress,
    }) {
        const project = 'factor-leverage-vault';
        const chain = 'arbitrum';
        const pool = `${market}-${assetAddress}-${debtAddress}-${chain}`.toLowerCase();
        const url = `https://app.factor.fi/studio/vault-leveraged/${protocol}/${market}/open-pair?asset=${assetAddress}&debt=${debtAddress}&vault=${vaultAddress}`;
        const symbol = `${protocol} ${assetSymbol}/${debtSymbol}`;
        const underlyingTokens = [assetAddress, debtAddress];

        const tvlUsd = this._getPairTvlUsd(assetAddress, debtAddress);

        const apyBase = this._getPairApyBase(
            market,
            assetAddress,
            debtAddress
        );

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

    _getPairTvlUsd(assetAddress, debtAddress) {
        if (!this._initialized) {
            throw new Error('Tvl pair map not initialized');
        }

        const mapId = `${assetAddress}-${debtAddress}`.toLowerCase();
        return this._pairTvlMap[mapId] ?? 0;
    }

    _getPairApyBase(market, assetAddress, debtAddress) {
        const adapter = this._getAdapterByMarket(market);
        if (!adapter) {
            // throw new Error(`No adapter found for protocol ${protocol}`);
            return 0;
        }
        return adapter.getApyBase(assetAddress, debtAddress);
    }
}

async function getLeverageVaultAPY() {
    const factorLeverageVaultHelper = new FactorLeverageVaultHelper(vaults);

    await factorLeverageVaultHelper.initialize();

    return factorLeverageVaultHelper.createPoolsData();
}

module.exports = {
    timetravel: false,
    apy: getLeverageVaultAPY,
};
