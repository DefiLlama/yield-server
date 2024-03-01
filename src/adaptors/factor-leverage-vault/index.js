const { request, gql } = require('graphql-request');
const { getCoinPriceMap } = require('./shared');
const vaults = require('./pairs');
const {
    AaveV3LeverageVaultHelper,
    CompoundV3LeverageVaultHelper,
    LodestarLeverageVaultHelper,
    SiloLeverageVaultHelper,
} = require('./adapters');
const { ScaleRewardVaultHelper } = require('./rewards/scale');

class FactorLeverageVaultHelper {
    constructor(vaults) {
        this._vaults = vaults;
        this._pairTvlMap = undefined;
        this._initialized = false;
        this._scaleRewardVaultHelper = new ScaleRewardVaultHelper(
            "0xAC0f45D2305a165ced8E73e4eE4542A108d43e54",
            "0x6dd963c510c2d2f09d5eddb48ede45fed063eb36",
            vaults.map((vault) => vault.stakedPool).filter((pool) => pool),
        );
        this._marketAdapterMap = {
            facAAVEv3: new AaveV3LeverageVaultHelper(),
            facCompound: new CompoundV3LeverageVaultHelper(
                '0xA5EDBDD9646f8dFF606d7448e414884C7d905dCA'
            ),
            facCompoundNative: new CompoundV3LeverageVaultHelper(
                '0x9c4ec768c28520B50860ea7a15bd7213a9fF58bf'
            ),
            facLodestar: new LodestarLeverageVaultHelper(
                '0x24C25910aF4068B5F6C3b75252a36c4810849135',
                [
                    // lusdce
                    '0x1ca530f02DD0487cef4943c674342c5aEa08922F',
                    // lusdc
                    '0x4C9aAed3b8c443b4b634D1A189a5e25C604768dE',
                    // lmagic
                    '0xf21Ef887CB667f84B8eC5934C1713A7Ade8c38Cf',
                    // lwbtc
                    '0xC37896BF3EE5a2c62Cdbd674035069776f721668',
                    // lusdt
                    '0x9365181A7df82a1cC578eAE443EFd89f00dbb643',
                    // ldpx
                    '0x5d27cFf80dF09f28534bb37d386D43aA60f88e25',
                    // larb
                    '0x8991d64fe388fA79A4f7Aa7826E8dA09F0c3C96a',
                    // ldai
                    '0x4987782da9a63bC3ABace48648B15546D821c720',
                    // lfrax
                    '0xD12d43Cdf498e377D3bfa2c6217f05B466E14228',
                    // lwsteth
                    '0xfECe754D92bd956F681A941Cef4632AB65710495',
                    // lgmx
                    '0x79B6c5e1A7C0aD507E1dB81eC7cF269062BAb4Eb',
                ]
            ),
            facSiloWSTETH: new SiloLeverageVaultHelper(
                '0xA8897b4552c075e884BDB8e7b704eB10DB29BF0D',
                '0x8658047e48CC09161f4152c79155Dac1d710Ff0a',
                '0x07b94eb6aad663c4eaf083fbb52928ff9a15be47'
            ),
            facSiloARB: new SiloLeverageVaultHelper(
                '0x0696E6808EE11a5750733a3d821F9bB847E584FB',
                '0x8658047e48CC09161f4152c79155Dac1d710Ff0a',
                '0x07b94eb6aad663c4eaf083fbb52928ff9a15be47'
            ),
            facSiloRETH: new SiloLeverageVaultHelper(
                '0x170A90981843461295a6CE0e0a631eE440222E29',
                '0x8658047e48CC09161f4152c79155Dac1d710Ff0a',
                '0x07b94eb6aad663c4eaf083fbb52928ff9a15be47'
            ),
            facSiloGMX: new SiloLeverageVaultHelper(
                '0xDe998E5EeF06dD09fF467086610B175F179A66A0',
                '0x8658047e48CC09161f4152c79155Dac1d710Ff0a',
                '0x07b94eb6aad663c4eaf083fbb52928ff9a15be47'
            ),
        };
    }

    async initialize() {
        await Promise.all([
            this._initializeTvlPairMap(),
            ...Object.values(this._marketAdapterMap).map((adapter) =>
                adapter.initialize()
            ),
            this._scaleRewardVaultHelper.initialize(),
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
                stakedVaultAddress: vault.stakedVaultAddress,
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
                    leverageVault {
                        id
                    }
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
            const vaultAddress = pair.leverageVault.id.toLowerCase();
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

            const mapId =
                `${vaultAddress}-${assetAddress}-${debtAddress}`.toLowerCase();
            tvlMap[mapId] = netValueUsd;
        });

        vaults.forEach((vault) => {
            const mapId =
                `${vault.pool}-${vault.assetAddress}-${vault.debtAddress}`.toLowerCase();
            if (tvlMap[mapId] === undefined) {
                tvlMap[mapId] = 0;
            }
        });

        this._pairTvlMap = tvlMap;
    }

    _getAdapterByMarket(market) {
        const adapter = this._marketAdapterMap[market];
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
        stakedVaultAddress,
    }) {
        const project = 'factor-leverage-vault';
        const chain = 'arbitrum';
        const pool =
            `${market}-${assetAddress}-${debtAddress}-${chain}`.toLowerCase();
        const url = `https://app.factor.fi/studio/vault-leveraged/${protocol}/${market}/open-pair?asset=${assetAddress}&debt=${debtAddress}&vault=${vaultAddress}`;
        const symbol = `${protocol} ${assetSymbol}/${debtSymbol}`;
        const underlyingTokens = [assetAddress, debtAddress];

        const tvlUsd = this._getPairTvlUsd(
            vaultAddress,
            assetAddress,
            debtAddress
        );

        const apyBase = this._getPairApyBase(market, assetAddress, debtAddress);
        const apyReward = stakedVaultAddress ? this._getPairApyReward(stakedVaultAddress, tvlUsd) : 0;

        return {
            pool,
            chain,
            project,
            symbol,
            tvlUsd,
            apyBase,
            apyReward,
            underlyingTokens,
            url,
        };
    }

    _getPairTvlUsd(vaultAddress, assetAddress, debtAddress) {
        if (!this._initialized) {
            throw new Error('Tvl pair map not initialized');
        }

        const mapId =
            `${vaultAddress}-${assetAddress}-${debtAddress}`.toLowerCase();
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

    _getPairApyReward(vaultAddress, tvlUsd) {
        if (!this._initialized) {
            throw new Error('Tvl pair map not initialized');
        }

        const apyReward = this._scaleRewardVaultHelper.getApyReward(
            vaultAddress,
            tvlUsd
        );

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
