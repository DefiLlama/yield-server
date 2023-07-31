var abi = {
    chickenBondManager: {
        calcUpdatedAccrualParameter: {
            inputs: [],
            name: 'calcUpdatedAccrualParameter',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'view',
            type: 'function',
        },
        CHICKEN_IN_AMM_FEE: {
            inputs: [],
            name: 'CHICKEN_IN_AMM_FEE',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'view',
            type: 'function',
        },
        calcSystemBackingRatio: {
            inputs: [],
            name: 'calcSystemBackingRatio',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'view',
            type: 'function',
        },
        getPendingLUSD: {
            inputs: [],
            name: 'getPendingLUSD',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'view',
            type: 'function',
        },
        totalWeightedStartTimes: {
            inputs: [],
            name: 'totalWeightedStartTimes',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'view',
            type: 'function',
        },
        targetAverageAgeSeconds: {
            inputs: [],
            name: 'targetAverageAgeSeconds',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            stateMutability: 'view',
            type: 'function',
        },
    },
    curveRegistrySwaps: {
        get_exchange_multiple_amount: {
            stateMutability: 'view',
            type: 'function',
            name: 'get_exchange_multiple_amount',
            outputs: [
                {
                    internalType: 'uint256',
                    name: '',
                    type: 'uint256',
                },
            ],
            inputs: [
                {
                    name: '_route',
                    type: 'address[9]',
                },
                {
                    name: '_swap_params',
                    type: 'uint256[3][4]',
                },
                {
                    name: '_amount',
                    type: 'uint256',
                },
            ],
        },
    },
};
module.exports = abi;
