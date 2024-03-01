const sdk = require('@defillama/sdk3');
const { makeReadable, getCoinPriceMap } = require('../shared');
const { request, gql } = require('graphql-request');

class ScaleRewardVaultHelper {
    constructor(scaleAddress, rewardTokenAddress, stakedVaultAddresses) {
        this._initialized = false;
        this._scaleAddress = scaleAddress;
        this._rewardTokenAddress = rewardTokenAddress;
        this._rewardTokenPriceUsd = undefined;
        this._stakedVaultAddresses = stakedVaultAddresses;
        this._vaultWeightsMap = {};
        this._totalFctrPerSec = undefined;
    }

    async initialize() {
        await Promise.all([
            this._initializeVaultWeights(),
            this._initializeRewardTokenPriceUsd(),
        ]);
        this._initialized = true;
    }

    getApyReward(stakedVaultAddress, tvlUsd) {
        if (!this._initialized) {
            throw new Error('Vault helper not initialized');
        }

        const secondsInYear = 31536000;
        const apyReward =
            (this._totalFctrPerSec *
                this._vaultWeightsMap[stakedVaultAddress.toLowerCase()] *
                secondsInYear *
                this._rewardTokenPriceUsd) /
            tvlUsd;

        return apyReward;
    }

    async _initializeVaultWeights() {
        this._totalFctrPerSec = (
            await sdk.api.abi.call({
                target: this._scaleAddress,
                abi: 'function fctrPerSec() public view returns (uint128)',
            })
        ).output;
        // this._toatlFctrPerSec = 100;

        const currentWTime = this._getCurrentWTime();
        this._vaultWeightsMap = (
            await sdk.api.abi.multiCall({
                calls: this._stakedVaultAddresses.map((stakedVaultAddress) => ({
                    target: this._scaleAddress,
                    params: [stakedVaultAddress, currentWTime],
                })),
                abi: 'function getVaultTotalVoteAt(address vault, uint128 wTime) external view returns (uint128)',
            })
        ).output.reduce((acc, call, index) => {
            const stakedVaultAddress = this._stakedVaultAddresses[index];
            acc[stakedVaultAddress.toLowerCase()] = call.output;
            return acc;
        }, {});

        console.log(this._vaultWeightsMap);
        console.log({currentWTime});
    }

    async _initializeRewardTokenPriceUsd() {
        const coinPriceMap = await getCoinPriceMap([this._rewardTokenAddress]);
        const rewardTokenPriceUsd = coinPriceMap[this._rewardTokenAddress];
        return rewardTokenPriceUsd;
    }

    _getCurrentWTime() {
        const timestamp = Math.floor(Date.now() / 1000);
        const week = 604800;
        const deployedWTime = 1708560000;
        const currentWTime =
            Math.floor((timestamp - deployedWTime) / week) * week +
            deployedWTime;

        return currentWTime;
    }
}

module.exports = {
    ScaleRewardVaultHelper,
};
