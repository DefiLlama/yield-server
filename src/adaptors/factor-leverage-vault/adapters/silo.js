const sdk = require('@defillama/sdk3');
const { makeReadable, getCoinPriceMap } = require('../../utils');
const { request, gql } = require('graphql-request');

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
                abi: "function getAssets() public view returns (address[] assets)",
                chain: 'arbitrum',
            })
        ).output;

        const _multicallHelper = (target, abi) => sdk.api.abi.multiCall({
            chain: 'arbitrum',
            calls: assets.map((asset) => ({
                target,
                params: [this.siloContractAddress, asset],
            })),
            abi,
        });

        const [ltvs, supplyApys, borrowApys] = await Promise.all([
            _multicallHelper(this.siloRepositoryAddress, "function getMaximumLTV(address _silo, address _asset) external view returns (uint256)"),
            _multicallHelper(this.siloLensAddress, "function depositAPY(address _silo, address _asset) external view returns (uint256)"),
            _multicallHelper(this.siloLensAddress, "function borrowAPY(address _silo, address _asset) external view returns (uint256)"),
        ]);


        assets.forEach((asset, index) => {
            this._ltvMap[asset.toLowerCase()] = parseInt(ltvs.output[index].output) / 10 ** 18;
            this._assetRateMap[asset.toLowerCase()] = parseInt(supplyApys.output[index].output) / 10 ** 18;
            this._debtRateMap[asset.toLowerCase()] = parseInt(borrowApys.output[index].output) / 10 ** 18;
        });
    }
}

module.exports = {
    SiloLeverageVaultHelper,
};
