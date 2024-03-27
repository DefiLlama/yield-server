const sdk = require('@defillama/sdk');
const { makeReadable, getCoinPriceMap } = require('../../utils');
const { request, gql } = require('graphql-request');

const cTokenMetadataAllABI = {
    inputs: [
        {
            internalType: 'contract CToken[]',
            name: 'cTokens',
            type: 'address[]',
        },
    ],
    name: 'cTokenMetadataAll',
    outputs: [
        {
            components: [
                {
                    internalType: 'address',
                    name: 'cToken',
                    type: 'address',
                },
                {
                    internalType: 'uint256',
                    name: 'exchangeRateCurrent',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'supplyRatePerBlock',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'borrowRatePerBlock',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'reserveFactorMantissa',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'totalBorrows',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'totalReserves',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'totalSupply',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'totalCash',
                    type: 'uint256',
                },
                {
                    internalType: 'bool',
                    name: 'isListed',
                    type: 'bool',
                },
                {
                    internalType: 'uint256',
                    name: 'collateralFactorMantissa',
                    type: 'uint256',
                },
                {
                    internalType: 'address',
                    name: 'underlyingAssetAddress',
                    type: 'address',
                },
                {
                    internalType: 'uint256',
                    name: 'cTokenDecimals',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'underlyingDecimals',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'compSupplySpeed',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'compBorrowSpeed',
                    type: 'uint256',
                },
                {
                    internalType: 'uint256',
                    name: 'borrowCap',
                    type: 'uint256',
                },
            ],
            internalType: 'struct CompoundLens.CTokenMetadata[]',
            name: '',
            type: 'tuple[]',
        },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
};

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
                abi: cTokenMetadataAllABI,
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
