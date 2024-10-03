const { multiRewardFarmsApy } = require('./common');

module.exports = () => multiRewardFarmsApy({
  arbitrum: {
    "0x6d2070b13929Df15B13D96cFC509C574168988Cd": {
      stakingTokenPool: "0bf3cb38-1908-4d85-87c3-af62651d5a03",
      pool: {
        project: 'abracadabra-spell',
        underlyingTokens: [
          "0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A", // MIM
          "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8", // USDC.e
          "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
        ],
        rewardTokens: [
          "0x912CE59144191C1204E64559FE8253a0e49E6548", // ARB
          "0x3E6648C5a70A150A88bCE65F4aD4d506Fe15d2AF" // SPELL
        ],
        symbol: "MIM-USDC.e-USDT",
        url: "https://app.abracadabra.money/#/farm/4",
      },
    },
  },
});
