const sdk = require('@defillama/sdk3');
const { makeReadable, getCoinPriceMap } = require('../../utils');
const { request, gql } = require('graphql-request');

class AaveV3LeverageVaultHelper {
    constructor(vaults) {
        this._vaults = vaults;
        this._initialized = false;
        this._assetRateMap = {};
        this._debtRateMap = {};
        this._ltvMap = {};
    }

    async initialize() {
        await Promise.all([this._initializeRates()]);
        this._initialized = true;
    }

    getApyBase(assetAddress, debtAddress) {
        if (!this._initialized) {
            throw new Error('Rates not initialized');
        }
        const supplyApy = this._assetRateMap[assetAddress.toLowerCase()];
        const borrowApy = this._debtRateMap[debtAddress.toLowerCase()];
        const apyBase = ltv * supplyApy - borrowApy;
        return apyBase;
    }

    // ================== Private Methods ================== //

    async _initializeRates() {
        const url =
            'https://api.thegraph.com/subgraphs/name/aave/protocol-v3-arbitrum';
        const query = gql`
            query ReservesQuery {
                reserves {
                    borrowingEnabled
                    name
                    symbol
                    aToken {
                        id
                        underlyingAssetAddress
                    }
                    liquidityRate
                    variableBorrowRate
                    baseLTVasCollateral
                }
            }
        `;
        const { reserves } = await request(url, query);

        reserves.forEach((reserve) => {
            const tokenAddress =
                reserve.aToken.underlyingAssetAddress.toLowerCase();
            const assetRate = Number(reserve.liquidityRate) / 10 ** 27;
            const debtRate = Number(reserve.variableBorrowRate) / 10 ** 27;

            this._assetRateMap[tokenAddress] = assetRate;
            this._debtRateMap[tokenAddress] = debtRate;
            this._ltvMap[tokenAddress] = reserve.baseLTVasCollateral / 10 ** 2;
        });
    }
}

module.exports = {
    AaveV3LeverageVaultHelper,
};
