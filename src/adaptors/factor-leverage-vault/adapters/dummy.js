const sdk = require('@defillama/sdk3');
const { makeReadable, getCoinPriceMap } = require('../../utils');
const { request, gql } = require('graphql-request');

class DummyLeverageVaultHelper {
    constructor(vaults) {
        this._vaults = vaults;
        this._initialized = false;
        this._assetRateMap = {};
        this._debtRateMap = {};
        this._ltvMap = {};
    }

    async initialize() {
    }

    getApyBase(assetAddress, debtAddress) {
        return 0;
    }

}

module.exports = {
    DummyLeverageVaultHelper,
};

