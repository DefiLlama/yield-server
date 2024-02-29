const sdk = require('@defillama/sdk3');
const { makeReadable, getCoinPriceMap } = require('../../utils');
const { request, gql } = require('graphql-request');
const abi = require('./abis/compoundV3Comet');

class CompoundV3LeverageVaultHelper {
    constructor(cometAddress) {
        this._initialized = false;
        this._supplyApy = 0;
        this._borrowApy = 0;
        this._ltvMap = {};
        this.cometAddress = cometAddress;
    }

    async initialize() {
        await Promise.all([this._initializeRates()]);
        this._initialized = true;
    }

    getApyBase(assetAddress, debtAddress) {
        if (!this._initialized) {
            throw new Error('Rates not initialized');
        }
        const supplyApy = this._supplyApy;
        const borrowApy = this._borrowApy;
        const ltv = this._ltvMap[assetAddress.toLowerCase()];
        const apyBase = (ltv * supplyApy - borrowApy) * 100;
        return apyBase;
    }

    // ================== Private Methods ================== //

    async _initializeRates() {
        const numAssets = await this._callToComet('numAssets');

        const numAssetsIndexes = [...Array(Number(numAssets)).keys()];
        const assetInfos = await this._multiCallToComet(
            'getAssetInfo',
            numAssetsIndexes
        );

        const utilization = await this._callToComet('getUtilization');
        const supplyRate = await this._callToComet('getSupplyRate', [utilization]);
        const borrowRate = await this._callToComet('getBorrowRate', [utilization]);

        const SECONDS_IN_YEAR = 31536000;
        this._supplyApy = (supplyRate / 1e18) * SECONDS_IN_YEAR;
        this._borrowApy = (borrowRate / 1e18) * SECONDS_IN_YEAR;

        assetInfos.forEach((assetInfo) => {
            const tokenAddress = assetInfo[1].toLowerCase();
            const ltv = assetInfo[4] / 1e18;
            this._ltvMap[tokenAddress.toLowerCase()] = ltv;
        });
    }

    async _callToComet(functionName, params = undefined) {
        const result = (
            await sdk.api.abi.call({
                target: this.cometAddress,
                abi: abi.find((i) => i.name === functionName),
                params: params,
                chain: 'arbitrum',
            })
        ).output;

        return result;
    }

    async _multiCallToComet(functionName, paramsList = undefined) {
        const resultsRaw = await sdk.api.abi.multiCall({
            abi: abi.find((i) => i.name === functionName),
            calls: paramsList.map((params) => ({
                target: this.cometAddress,
                params: params,
            })),
            chain: 'arbitrum',
        });
        const results = resultsRaw.output.map((o) => o.output);

        return results;
    }
}

module.exports = {
    CompoundV3LeverageVaultHelper,
};
