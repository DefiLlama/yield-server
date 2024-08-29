import type { MultiRewardFarmsApy } from '../abracadabra-spell/common';
const { multiRewardFarmsApy } = require('../abracadabra-spell/common') as { multiRewardFarmsApy: MultiRewardFarmsApy };


module.exports = {
  timetravel: false,
  apy: () => multiRewardFarmsApy({
    arbitrum: {
      "0xc30911b52b5752447aB08615973e434c801CD652": {
        pool: {
          project: 'mim-swap',
          underlyingTokens: [
            "0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A", // MIM
            "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", // USDT
          ],
          symbol: 'MIM-USDT',
          url: "https://app.abracadabra.money/#/pool/1/42161",
        },
      },
      "0x280c64c4C4869CF2A6762EaDD4701360C1B11F97": {
        pool: {
          project: 'mim-swap',
          underlyingTokens: [
            "0xFEa7a6a0B346362BF88A9e4A88416B77a57D6c2A", // MIM
            "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC
          ],
          symbol: 'MIM-USDC',
          url: "https://app.abracadabra.money/#/pool/2/42161",
        },
      },
    },
    kava: {
      "0xcF4f8E9A113433046B990980ebce5c3fA883067f": {
        pool: {
          project: 'mim-swap',
          underlyingTokens: [
            "0x471EE749bA270eb4c1165B5AD95E614947f6fCeb", // MIM
            "0x919C1c267BC06a7039e03fcc2eF738525769109c", // USDT
          ],
          symbol: 'MIM-USDT',
          url: "https://app.abracadabra.money/#/pool/1/2222",
        },
      },
    },
  }),
  url: 'https://app.abracadabra.money',
};
