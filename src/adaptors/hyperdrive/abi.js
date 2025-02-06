module.exports = {
    GET_POOL_CONFIG_ABI: {
        "inputs": [],
        "name": "getPoolConfig",
        "outputs": [{
          "components": [
            { "name": "baseToken", "type": "address" },
            { "name": "vaultSharesToken", "type": "address" },
            { "name": "linkerFactory", "type": "address" },
            { "name": "linkerCodeHash", "type": "bytes32" },
            { "name": "initialVaultSharePrice", "type": "uint256" },
            { "name": "minimumShareReserves", "type": "uint256" },
            { "name": "minimumTransactionAmount", "type": "uint256" },
            { "name": "circuitBreakerDelta", "type": "uint256" },
            { "name": "positionDuration", "type": "uint256" },
            { "name": "checkpointDuration", "type": "uint256" },
            { "name": "timeStretch", "type": "uint256" },
            { "name": "governance", "type": "address" },
            { "name": "feeCollector", "type": "address" },
            { "name": "sweepCollector", "type": "address" },
            { "name": "checkpointRewarder", "type": "address" },
            {
              "components": [
                { "name": "curve", "type": "uint256" },
                { "name": "flat", "type": "uint256" },
                { "name": "governanceLP", "type": "uint256" },
                { "name": "governanceZombie", "type": "uint256" }
              ],
              "name": "fees",
              "type": "tuple"
            }
          ],
          "name": "",
          "type": "tuple"
        }],
        "stateMutability": "view",
        "type": "function"
      },
      GET_POOL_INFO_ABI: {
        "inputs": [],
        "name": "getPoolInfo",
        "outputs": [{
          "components": [
            { "name": "shareReserves", "type": "uint256" },
            { "name": "shareAdjustment", "type": "int256" },
            { "name": "zombieBaseProceeds", "type": "uint256" },
            { "name": "zombieShareReserves", "type": "uint256" },
            { "name": "bondReserves", "type": "uint256" },
            { "name": "lpTotalSupply", "type": "uint256" },
            { "name": "vaultSharePrice", "type": "uint256" },
            { "name": "longsOutstanding", "type": "uint256" },
            { "name": "longAverageMaturityTime", "type": "uint256" },
            { "name": "shortsOutstanding", "type": "uint256" },
            { "name": "shortAverageMaturityTime", "type": "uint256" },
            { "name": "withdrawalSharesReadyToWithdraw", "type": "uint256" },
            { "name": "withdrawalSharesProceeds", "type": "uint256" },
            { "name": "lpSharePrice", "type": "uint256" },
            { "name": "longExposure", "type": "uint256" }
          ],
          "name": "",
          "type": "tuple"
        }],
        "stateMutability": "view",
        "type": "function"
      },
      POSITION_ABI: {
        "inputs": [
          { "name": "id", "type": "bytes32" },
          { "name": "user", "type": "address" }
        ],
        "name": "position",
        "outputs": [{
          "components": [
            { "name": "supplyShares", "type": "uint256" },
            { "name": "borrowShares", "type": "uint128" },
            { "name": "collateral", "type": "uint128" }
          ],
          "name": "",
          "type": "tuple"
        }],
        "stateMutability": "view",
        "type": "function"
      },
      MARKET_ABI: {
        "inputs": [
          {
            "internalType": "Id",
            "name": "",
            "type": "bytes32"
          }
        ],
        "name": "market",
        "outputs": [
          {
            "internalType": "uint128",
            "name": "totalSupplyAssets",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "totalSupplyShares",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "totalBorrowAssets",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "totalBorrowShares",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "lastUpdate",
            "type": "uint128"
          },
          {
            "internalType": "uint128",
            "name": "fee",
            "type": "uint128"
          }
        ],
        "stateMutability": "view",
        "type": "function"
      }
};