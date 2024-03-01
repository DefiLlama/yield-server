const sdk = require('@defillama/sdk3');
const { makeReadable, getCoinPriceMap } = require('../../utils');
const { request, gql } = require('graphql-request');

const lodestarLensAbi = [
    'function cTokenMetadataAll(address[] cTokens) external returns ((address cToken, uint exchangeRateCurrent, uint supplyRatePerBlock, uint borrowRatePerBlock, uint reserveFactorMantissa, uint totalBorrows, uint totalReserves, uint totalSupply, uint totalCash, bool isListed, uint collateralFactorMantissa, address underlyingAssetAddress, uint cTokenDecimals, uint underlyingDecimals, uint compSupplySpeed, uint compBorrowSpeed, uint borrowCap)[])',
];

class LodestarLeverageVaultHelper {
    constructor(lensAddress, lTokenAddresses) {
        this._initialized = false;
        this._assetRateMap = {};
        this._debtRateMap = {};
        this._ltvMap = {};
        this.lensAddress = lensAddress;
        this.lTokenAddresses = lTokenAddresses;
    }

    async initialize() {
        await this._initializeRates();
        this._initialized = true;
    }

    getApyBase(assetAddress, debtAddress) {
        if (!this._initialized) {
            throw new Error('Rates not initialized');
        }

        const calculateApy = (rate, time) => (1 + rate) ** time - 1;
        const blockPerYear = 2628000;

        const supplyApy = calculateApy(
            this._assetRateMap[assetAddress.toLowerCase()],
            blockPerYear
        );
        const borrowApy = calculateApy(
            this._debtRateMap[debtAddress.toLowerCase()],
            blockPerYear
        );

        const apyBase =
            (this._ltvMap[assetAddress.toLowerCase()] * supplyApy - borrowApy) *
            100;

        return apyBase;
    }

    async _initializeRates() {
        const tokenMetadatas = (
            await sdk.api.abi.call({
                target: this.lensAddress,
                abi: lodestarLensAbi[0],
                params: [this.lTokenAddresses],
                chain: 'arbitrum',
            })
        ).output;

        tokenMetadatas.forEach((tokenMetadata) => {
            const tokenAddress =
                tokenMetadata.underlyingAssetAddress.toLowerCase();
            const assetRate =
                Number(tokenMetadata.supplyRatePerBlock) / 10 ** 18;
            const debtRate =
                Number(tokenMetadata.borrowRatePerBlock) / 10 ** 18;
            const ltv =
                Number(tokenMetadata.collateralFactorMantissa) / 10 ** 18;

            this._assetRateMap[tokenAddress] = assetRate;
            this._debtRateMap[tokenAddress] = debtRate;
            this._ltvMap[tokenAddress] = ltv;
        });
    }
}

module.exports = {
    LodestarLeverageVaultHelper,
};
