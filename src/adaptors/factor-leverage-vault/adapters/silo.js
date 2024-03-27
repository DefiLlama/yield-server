const sdk = require('@defillama/sdk');
const { makeReadable, getCoinPriceMap } = require('../../utils');
const { request, gql } = require('graphql-request');

const getAssetsABI = {
    inputs: [],
    name: 'getAssets',
    outputs: [{ internalType: 'address[]', name: 'assets', type: 'address[]' }],
    stateMutability: 'view',
    type: 'function',
};

const depositAPYABI = {
    inputs: [
        { internalType: 'contract ISilo', name: '_silo', type: 'address' },
        { internalType: 'address', name: '_asset', type: 'address' },
    ],
    name: 'depositAPY',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
};

const borrowAPYABI = {
    inputs: [
        { internalType: 'contract ISilo', name: '_silo', type: 'address' },
        { internalType: 'address', name: '_asset', type: 'address' },
    ],
    name: 'borrowAPY',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
};

const getMaximumLTVABI = {
    inputs: [
        { internalType: 'address', name: '_silo', type: 'address' },
        { internalType: 'address', name: '_asset', type: 'address' },
    ],
    name: 'getMaximumLTV',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
};

class SiloLeverageVaultHelper {
    constructor(siloContractAddress, siloRepositoryAddress, siloLensAddress) {
        this._initialized = false;
        this._assetRateMap = {};
        this._debtRateMap = {};
        this._ltvMap = {};
        this.siloContractAddress = siloContractAddress;
        this.siloRepositoryAddress = siloRepositoryAddress;
        this.siloLensAddress = siloLensAddress;
    }

    async initialize() {
        await this._initializeRates();
        this._initialized = true;
    }

    getApyBase(assetAddress, debtAddress) {
        const supplyApy = this._assetRateMap[assetAddress.toLowerCase()];
        const borrowApy = this._debtRateMap[debtAddress.toLowerCase()];
        const ltv = this._ltvMap[assetAddress.toLowerCase()];
        const apyBase = (ltv * supplyApy - borrowApy) * 100;
        return apyBase;
    }

    // ================== Private Methods ================== //

    async _initializeRates() {
        const assets = (
            await sdk.api.abi.call({
                target: this.siloContractAddress,
                abi: getAssetsABI,
                chain: 'arbitrum',
            })
        ).output;

        const _multicallHelper = (target, abi) =>
            sdk.api.abi.multiCall({
                chain: 'arbitrum',
                calls: assets.map((asset) => ({
                    target,
                    params: [this.siloContractAddress, asset],
                })),
                abi,
            });

        const [ltvs, supplyApys, borrowApys] = await Promise.all([
            _multicallHelper(
                this.siloRepositoryAddress,
                getMaximumLTVABI
            ),
            _multicallHelper(this.siloLensAddress, depositAPYABI),
            _multicallHelper(this.siloLensAddress, borrowAPYABI),
        ]);

        assets.forEach((asset, index) => {
            this._ltvMap[asset.toLowerCase()] =
                parseInt(ltvs.output[index].output) / 10 ** 18;
            this._assetRateMap[asset.toLowerCase()] =
                parseInt(supplyApys.output[index].output) / 10 ** 18;
            this._debtRateMap[asset.toLowerCase()] =
                parseInt(borrowApys.output[index].output) / 10 ** 18;
        });
    }
}

module.exports = {
    SiloLeverageVaultHelper,
};
