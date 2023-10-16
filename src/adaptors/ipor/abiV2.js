module.exports = {
  liquidityMiningV2Abi: [
    {
      inputs: [
        {
          internalType: "address[]",
          name: "lpTokens",
          type: "address[]"
        }
      ],
      name: "getGlobalIndicators",
      outputs: [
        {
          components: [
            {
              internalType: "address",
              name: "lpToken",
              type: "address"
            },
            {
              components: [
                {
                  internalType: "uint256",
                  name: "aggregatedPowerUp",
                  type: "uint256"
                },
                {
                  internalType: "uint128",
                  name: "compositeMultiplierInTheBlock",
                  type: "uint128"
                },
                {
                  internalType: "uint128",
                  name: "compositeMultiplierCumulativePrevBlock",
                  type: "uint128"
                },
                {
                  internalType: "uint32",
                  name: "blockNumber",
                  type: "uint32"
                },
                {
                  internalType: "uint32",
                  name: "rewardsPerBlock",
                  type: "uint32"
                },
                {
                  internalType: "uint88",
                  name: "accruedRewards",
                  type: "uint88"
                }
              ],
              internalType: "struct ILiquidityMiningLens.GlobalRewardsIndicators",
              name: "indicators",
              type: "tuple"
            }
          ],
          internalType: "struct ILiquidityMiningLens.GlobalIndicatorsResult[]",
          name: "",
          type: "tuple[]"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
  ]
}
