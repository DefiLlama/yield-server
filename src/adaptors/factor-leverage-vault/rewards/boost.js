const sdk = require('@defillama/sdk3');
const { makeReadable, getCoinPriceMap } = require('../shared');
const { request, gql } = require('graphql-request');

class BoostRewardVaultHelper {
    constructor(boostControllerAddress, stakedVaultAddresses) {
        this._initialized = false;
        this._boostControllerAddress = boostControllerAddress;
        this._stakedVaultAddresses = stakedVaultAddresses;
        this._rewardTokensMap = {};
        this._rewardTokenRateMap = {};
        this._rewardTokenPriceUsdMap = {};
    }

    async initialize() {
        const rewardTokensMap = await this._initializeRewardTokensMap(
            this._stakedVaultAddresses
        );

        const [rewardTokenRateMap, rewardTokenPriceUsd] = await Promise.all([
            this._initializeRewardTokenRateMap(rewardTokensMap),
            this._initializeRewardTokenPriceUsdMap(rewardTokensMap),
        ]);

        this._initialized = true;
    }

    // rewardTokensMap[stakedVaultAddress] = [rewardToken1, rewardToken2, rewardToken3]
    async _initializeRewardTokensMap(stakedVaultAddresses) {
        const rewardTokens = (
            await sdk.api.abi.multiCall({
                calls: stakedVaultAddresses.map((stakedVaultAddress) => ({
                    target: this._boostControllerAddress,
                    params: [stakedVaultAddress],
                })),
                abi: 'function getAllRewardTokens(address) external view returns (address[])',
                chain: 'arbitrum',
            })
        ).output;

        const rewardTokensMap = rewardTokens.reduce((acc, call, index) => {
            const stakedVaultAddress = stakedVaultAddresses[index];
            acc[stakedVaultAddress.toLowerCase()] = call.output;
            return acc;
        }, {});

        this._rewardTokensMap = rewardTokensMap;
        return rewardTokensMap;
    }

    // rewardTokenRateMap[stakedVaultAddress-rewardTokenAddress] = [rewardRate, rewardPerSec, lastUpdate, lastFctr]
    async _initializeRewardTokenRateMap(rewardTokensMap) {
        const rewardDataEntries = Object.entries(rewardTokensMap);
        const calls = rewardDataEntries.flatMap(
            ([stakedVaultAddress, rewardTokenAddresses]) =>
                rewardTokenAddresses.map((rewardTokenAddress) => ({
                    target: stakedVaultAddress,
                    params: [rewardTokenAddress],
                }))
        );
        const rewardDataCalls = (
            await sdk.api.abi.multiCall({
                calls: calls,
                abi: 'function rewardData(address) public view returns ((uint256,uint256,uint256,uint256))',
                chain: 'arbitrum',
            })
        ).output.map((call, index) => call.output);

        const rewardTokenRateMap = {};
        let i = 0;
        let j = 0;
        while (i < rewardDataEntries.length) {
            const [stakedVaultAddress, rewardTokenAddresses] =
                rewardDataEntries[i];
            let k = 0;
            while (k < rewardTokenAddresses.length) {
                const rewardTokenAddress = rewardTokenAddresses[k];
                rewardTokenRateMap[stakedVaultAddress.toLowerCase()] = {
                    ...rewardTokenRateMap[stakedVaultAddress.toLowerCase()],
                    [rewardTokenAddress.toLowerCase()]: rewardDataCalls[j],
                };
                j++;
                k++;
            }
            i++;
        }

        this._rewardTokenRateMap = rewardTokenRateMap;
        return rewardTokenRateMap;
    }

    async _initializeRewardTokenPriceUsdMap(rewardTokensMap) {
        // get all reward tokens price
        const uniqueRewardTokens = new Set(
            Object.values(rewardTokensMap)
                .flat()
                .map((rewardToken) => rewardToken.toLowerCase())
        );
        const coinPriceMap = await getCoinPriceMap([...uniqueRewardTokens]);

        this._rewardTokenPriceUsdMap = coinPriceMap;
        return coinPriceMap;
    }

    getApyReward(stakedVaultAddress, tvlUsd) {
        if (!this._initialized) {
            throw new Error('Vault helper not initialized');
        }

        const rewardTokensRates =
            this._rewardTokenRateMap[stakedVaultAddress.toLowerCase()];

        const rewardTokens = Object.keys(rewardTokensRates);

        const totalRewardUsdPerYear = rewardTokens.reduce(
            (acc, rewardToken) => {
                const [periodFinish, rewardRate] =
                    rewardTokensRates[rewardToken.toLowerCase()];
                const rewardTokenMetadataMap =
                    this._rewardTokenPriceUsdMap[rewardToken.toLowerCase()];

                const rewardTokenPriceUsd = rewardTokenMetadataMap.price;
                const rewardTokenDecimals = rewardTokenMetadataMap.decimals;

                if (parseInt(periodFinish) < Date.now() / 1000) return acc;

                const rewardUsdPerYear =
                    (parseInt(rewardRate) * rewardTokenPriceUsd * 31536000) /
                    10 ** rewardTokenDecimals;

                return acc + rewardUsdPerYear;
            },
            0
        );


        const tvlUsdNormalized = tvlUsd > 0 ? tvlUsd : 1;
        const apyReward = (totalRewardUsdPerYear / tvlUsdNormalized) * 100;

        return apyReward;
    }
}

module.exports = {
    BoostRewardVaultHelper,
};
