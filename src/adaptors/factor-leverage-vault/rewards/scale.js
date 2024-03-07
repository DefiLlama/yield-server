const sdk = require('@defillama/sdk');
const { makeReadable, getCoinPriceMap } = require('../shared');
const { request, gql } = require('graphql-request');

const getVaultTotalVoteAtABI = {
    inputs: [
        { internalType: 'address', name: 'vault', type: 'address' },
        { internalType: 'uint128', name: 'wTime', type: 'uint128' },
    ],
    name: 'getVaultTotalVoteAt',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
};

const fctrPerSecABI = {
    inputs: [],
    name: 'fctrPerSec',
    outputs: [{ internalType: 'uint128', name: '', type: 'uint128' }],
    stateMutability: 'view',
    type: 'function',
};

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

        const totalVaultWeights = Object.values(this._vaultWeightsMap).reduce(
            (acc, weight) => acc + parseInt(weight),
            0
        );

        const rewardTokenPriceUsd = this._rewardTokenPriceUsd.price;
        const rewardTokenDecimals = this._rewardTokenPriceUsd.decimals;

        const secondsInYear = 86400 * 365;

        const voteWeight =
            this._vaultWeightsMap[stakedVaultAddress.toLowerCase()] /
            totalVaultWeights;
        const rewardAmountPerSec = this._totalFctrPerSec * voteWeight;
        const rewardAmountPerSecUsd =
            (rewardAmountPerSec * rewardTokenPriceUsd) /
            10 ** rewardTokenDecimals;

        const tvlUsdNormalized = tvlUsd > 0 ? tvlUsd : 1;
        const apyReward =
            (rewardAmountPerSecUsd * secondsInYear * 100) / tvlUsdNormalized;

        return apyReward;
    }

    async _initializeVaultWeights() {
        this._totalFctrPerSec = (
            await sdk.api.abi.call({
                target: this._scaleAddress,
                abi: fctrPerSecABI,
                chain: 'arbitrum',
            })
        ).output;

        const currentWTime = this._getCurrentWTime();
        this._vaultWeightsMap = (
            await sdk.api.abi.multiCall({
                calls: this._stakedVaultAddresses.map((stakedVaultAddress) => ({
                    target: this._scaleAddress,
                    params: [stakedVaultAddress, currentWTime],
                })),
                abi: getVaultTotalVoteAtABI,
                chain: 'arbitrum',
            })
        ).output.reduce((acc, call, index) => {
            const stakedVaultAddress = this._stakedVaultAddresses[index];
            acc[stakedVaultAddress.toLowerCase()] = call.output;
            return acc;
        }, {});
    }

    async _initializeRewardTokenPriceUsd() {
        const coinPriceMap = await getCoinPriceMap([this._rewardTokenAddress]);
        const rewardTokenPriceUsd = coinPriceMap[this._rewardTokenAddress];
        this._rewardTokenPriceUsd = rewardTokenPriceUsd;
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
