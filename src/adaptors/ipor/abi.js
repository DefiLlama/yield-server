module.exports = {
  liquidityMiningAbi: [
    {
      inputs: [
        {
          internalType: "address",
          name: "lpToken",
          type: "address"
        }
      ],
      name: "getGlobalIndicators",
      outputs: [
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
          internalType: "struct LiquidityMiningTypes.GlobalRewardsIndicators",
          name: "",
          type: "tuple"
        }
      ],
      stateMutability: "view",
      type: "function"
    },
  ]
}
