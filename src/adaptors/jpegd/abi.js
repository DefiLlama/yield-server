var APE_STAKING_ABI = {
    getPoolsUI: {
        inputs: [],
        name: 'getPoolsUI',
        outputs: [
            {
                components: [
                    {
                        internalType: 'uint256',
                        name: 'poolId',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'stakedAmount',
                        type: 'uint256',
                    },
                    {
                        components: [
                            {
                                internalType: 'uint48',
                                name: 'startTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint48',
                                name: 'endTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint96',
                                name: 'rewardsPerHour',
                                type: 'uint96',
                            },
                            {
                                internalType: 'uint96',
                                name: 'capPerPosition',
                                type: 'uint96',
                            },
                        ],
                        internalType: 'struct ApeCoinStaking.TimeRange',
                        name: 'currentTimeRange',
                        type: 'tuple',
                    },
                ],
                internalType: 'struct ApeCoinStaking.PoolUI',
                name: '',
                type: 'tuple',
            },
            {
                components: [
                    {
                        internalType: 'uint256',
                        name: 'poolId',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'stakedAmount',
                        type: 'uint256',
                    },
                    {
                        components: [
                            {
                                internalType: 'uint48',
                                name: 'startTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint48',
                                name: 'endTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint96',
                                name: 'rewardsPerHour',
                                type: 'uint96',
                            },
                            {
                                internalType: 'uint96',
                                name: 'capPerPosition',
                                type: 'uint96',
                            },
                        ],
                        internalType: 'struct ApeCoinStaking.TimeRange',
                        name: 'currentTimeRange',
                        type: 'tuple',
                    },
                ],
                internalType: 'struct ApeCoinStaking.PoolUI',
                name: '',
                type: 'tuple',
            },
            {
                components: [
                    {
                        internalType: 'uint256',
                        name: 'poolId',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'stakedAmount',
                        type: 'uint256',
                    },
                    {
                        components: [
                            {
                                internalType: 'uint48',
                                name: 'startTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint48',
                                name: 'endTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint96',
                                name: 'rewardsPerHour',
                                type: 'uint96',
                            },
                            {
                                internalType: 'uint96',
                                name: 'capPerPosition',
                                type: 'uint96',
                            },
                        ],
                        internalType: 'struct ApeCoinStaking.TimeRange',
                        name: 'currentTimeRange',
                        type: 'tuple',
                    },
                ],
                internalType: 'struct ApeCoinStaking.PoolUI',
                name: '',
                type: 'tuple',
            },
            {
                components: [
                    {
                        internalType: 'uint256',
                        name: 'poolId',
                        type: 'uint256',
                    },
                    {
                        internalType: 'uint256',
                        name: 'stakedAmount',
                        type: 'uint256',
                    },
                    {
                        components: [
                            {
                                internalType: 'uint48',
                                name: 'startTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint48',
                                name: 'endTimestampHour',
                                type: 'uint48',
                            },
                            {
                                internalType: 'uint96',
                                name: 'rewardsPerHour',
                                type: 'uint96',
                            },
                            {
                                internalType: 'uint96',
                                name: 'capPerPosition',
                                type: 'uint96',
                            },
                        ],
                        internalType: 'struct ApeCoinStaking.TimeRange',
                        name: 'currentTimeRange',
                        type: 'tuple',
                    },
                ],
                internalType: 'struct ApeCoinStaking.PoolUI',
                name: '',
                type: 'tuple',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
};
var APE_MATCHING_ABI = {
    nextNonce: {
        inputs: [],
        name: 'nextNonce',
        outputs: [
            {
                internalType: 'uint24',
                name: '',
                type: 'uint24',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
    offers: {
        inputs: [
            {
                internalType: 'uint24',
                name: '',
                type: 'uint24',
            },
        ],
        name: 'offers',
        outputs: [
            {
                internalType: 'enum ApeMatchingMarketplace.OfferType',
                name: 'offerType',
                type: 'uint8',
            },
            {
                components: [
                    {
                        internalType: 'enum ApeStakingLib.Collections',
                        name: 'collection',
                        type: 'uint8',
                    },
                    {
                        internalType: 'uint16',
                        name: 'tokenId',
                        type: 'uint16',
                    },
                ],
                internalType: 'struct ApeMatchingMarketplace.MainNFT',
                name: 'mainNft',
                type: 'tuple',
            },
            {
                internalType: 'uint16',
                name: 'bakcTokenId',
                type: 'uint16',
            },
            {
                internalType: 'uint80',
                name: 'apeAmount',
                type: 'uint80',
            },
            {
                internalType: 'uint16',
                name: 'apeRewardShareBps',
                type: 'uint16',
            },
            {
                internalType: 'uint16',
                name: 'bakcRewardShareBps',
                type: 'uint16',
            },
            {
                internalType: 'bool',
                name: 'isPaired',
                type: 'bool',
            },
            {
                internalType: 'uint80',
                name: 'lastSingleStakingRewardPerShare',
                type: 'uint80',
            },
        ],
        stateMutability: 'view',
        type: 'function',
    },
};
module.exports = {
    APE_STAKING_ABI: APE_STAKING_ABI,
    APE_MATCHING_ABI: APE_MATCHING_ABI,
};
