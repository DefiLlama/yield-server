const PROJECT_SLUG = 'folks-finance-xchain';

const ONE_18_DP = BigInt(1e18);
const EVERY_HOUR = BigInt(365 * 24);
const EVERY_SECOND = BigInt(365 * 24 * 60 * 60);

const GENERAL_LOAN_TYPE = 2;

const loanManagerAddress = '0xF4c542518320F09943C35Db6773b2f9FeB2F847e';

const rewardsV2Address = '0x3E85a56C2202Ec067EB4Ac090db3e8149dA46d19';

const HubPools = {
  avax: {
    name: 'Avalanche',
    pools: [
      {
        // USDC
        id: 1,
        underlyingSymbol: 'USDC',
        poolAddress: '0x88f15e36308ED060d8543DA8E2a5dA0810Efded2',
        tokenAddress: '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e',
      },
      {
        // AVAX
        id: 2,
        underlyingSymbol: 'AVAX',
        poolAddress: '0x0259617bE41aDA4D97deD60dAf848Caa6db3F228',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        spokeAddress: '0xe69e068539Ee627bAb1Ce878843a6C76484CBd2c',
      },
      {
        // sAVAX
        id: 3,
        underlyingSymbol: 'sAVAX',
        poolAddress: '0x7033105d1a527d342bE618ab1F222BB310C8d70b',
        tokenAddress: '0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be',
        spokeAddress: '0x23a96D92C80E8b926dA40E574d615d9e806A87F6',
      },
      {
        // wETH_ava
        id: 6,
        underlyingSymbol: 'WETH.e',
        poolAddress: '0x795CcF6f7601edb41E4b3123c778C56F0F19389A',
        tokenAddress: '0x49d5c2bdffac6ce2bfdb6640f4f80f226bc10bab',
        spokeAddress: '0x0e563B9fe6D9EF642bDbA20D53ac5137EB0d78DC',
      },
      {
        // BTCb_ava
        id: 8,
        underlyingSymbol: 'BTC.b',
        poolAddress: '0x1C51AA1516e1156d98075F2F64e259906051ABa9',
        tokenAddress: '0x152b9d0fdc40c096757f570a51e494bd4b943e50',
        spokeAddress: '0xef7a6EBEDe2ad558DB8c36Df65365b209E5d57dC',
      },
      {
        // SolvBTC
        id: 15,
        underlyingSymbol: 'SolvBTC',
        poolAddress: '0x307bCEC89624660Ed06C97033EDb7eF49Ab0EB2D',
        tokenAddress: '0xbc78D84Ba0c46dFe32cf2895a19939c86b81a777',
      },
      {
        // JOE
        id: 16,
        underlyingSymbol: 'JOE',
        poolAddress: '0x5e5a2007a8D613C4C98F425097166095C875e6eE',
        tokenAddress: '0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd',
        spokeAddress: '0x3b1C2eC8B7cdE241E0890C9742C14dD7867aA812',
      },
      {
        // ggAVAX
        id: 17,
        underlyingSymbol: 'ggAVAX',
        poolAddress: '0xAdA5Be2A259096fd11D00c2b5c1181843eD008DC',
        tokenAddress: '0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3',
        spokeAddress: '0xe53189D00D1b4F231A2a208a7967E0dCaE8Db073',
      },
    ],
  },
  ethereum: {
    name: 'Ethereum',
    pools: [
      // excluding USDC because bridged
      // excluding SolvBTC because bridged
      {
        // ETH_eth
        id: 4,
        underlyingSymbol: 'ETH',
        poolAddress: '0xB6DF8914C084242A19A4C7fb15368be244Da3c75',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        spokeAddress: '0xe3B0e4Db870aA58A24f87d895c62D3dc5CD05883',
      },
      {
        // wBTC_eth
        id: 7,
        underlyingSymbol: 'WBTC',
        poolAddress: '0x9936812835476504D6Cf495F4F0C718Ec19B3Aff',
        spokeAddress: '0xb39c03297E87032fF69f4D42A6698e4c4A934449',
        tokenAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
      },
    ],
  },
  base: {
    name: 'Base',
    pools: [
      // excluding USDC because bridged
      // excluding SolvBTC because bridged
      {
        // ETH_base
        id: 5,
        underlyingSymbol: 'ETH',
        poolAddress: '0x51958ed7B96F57142CE63BB223bbd9ce23DA7125',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        spokeAddress: '0xe3B0e4Db870aA58A24f87d895c62D3dc5CD05883',
      },
      {
        // cbBTC_base
        id: 9,
        underlyingSymbol: 'cbBTC',
        poolAddress: '0x9eD81F0b5b0E9b6dE00F374fFc7f270902576EF7',
        tokenAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf',
        spokeAddress: '0x50d5Bb3Cf57D2fB003b602A6fD10F90baa8567EA',
      },
    ],
  },
  bsc: {
    name: 'Binance',
    pools: [
      // excluding SolvBTC because bridged
      {
        // BNB
        id: 10,
        underlyingSymbol: 'BNB',
        poolAddress: '0x89970d3662614a5A4C9857Fcc9D9C3FA03824fe3',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        spokeAddress: '0x5f2F4771B7dc7e2F7E9c1308B154E1e8957ecAB0',
      },
      {
        // ETHB_bsc
        id: 11,
        underlyingSymbol: 'ETH',
        poolAddress: '0x18031B374a571F9e060de41De58Abb5957cD5258',
        tokenAddress: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
        spokeAddress: '0x4Db12F554623E4B0b3F5bAcF1c8490D4493380A5',
      },
      {
        // BTCB_bsc
        id: 12,
        underlyingSymbol: 'BTCB',
        poolAddress: '0xC2FD40D9Ec4Ae7e71068652209EB75258809e131',
        tokenAddress: '0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c',
        spokeAddress: '0x12Db9758c4D9902334C523b94e436258EB54156f',
      },
    ],
  },
  arbitrum: {
    name: 'Arbitrum',
    pools: [
      // excluding USDC because bridged
      // excluding SolvBTC because bridged
      {
        // ETH_arb
        id: 13,
        underlyingSymbol: 'ETH',
        poolAddress: '0x44E0d0809AF8Ee37BFb1A4e75D5EF5B96F6346A3',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        spokeAddress: '0x37d761883a01e9F0B0d7fe59EEC8c21D94393CDD',
      },
      {
        // ARB
        id: 14,
        underlyingSymbol: 'ARB',
        poolAddress: '0x1177A3c2CccDb9c50D52Fc2D30a13b2c3C40BCF4',
        tokenAddress: '0x912ce59144191c1204e64559fe8253a0e49e6548',
        spokeAddress: '0x1b2a8d56967d00700DD5C94E27B1a116a1deF8Df',
      },
    ],
  },
  polygon: {
    name: 'Polygon',
    pools: [
      // excluding USDC cause bridged
      {
        // POL
        id: 19,
        underlyingSymbol: 'POL',
        poolAddress: '0x481cF0c02BF17a33753CE32f1931ED9990fFB40E',
        tokenAddress: '0x0000000000000000000000000000000000000000',
        spokeAddress: '0x4Db12F554623E4B0b3F5bAcF1c8490D4493380A5',
      },
      {
        // wBTC_pol
        id: 20,
        underlyingSymbol: 'WBTC',
        poolAddress: '0x7054254933279d93D97309745AfbFF9310cdb570',
        tokenAddress: '0x1bfd67037b42cf73acf2047067bd4f2c47d9bfd6',
        spokeAddress: '0x1A40208E9506E08a6f62DbCCf8de7387743179E9',
      },
      {
        // wETH_pol
        id: 21,
        underlyingSymbol: 'WETH',
        poolAddress: '0x88Ae56886233C706409c74c3D4EA9A9Ac1D65ab2',
        tokenAddress: '0x7ceb23fd6bc0add59e62ac25578270cff1b9f619',
        spokeAddress: '0x2e6e4603536078bd7661338F06FB93cf6F9b7A98',
      },
    ],
  },
};

const RewardsTokenV2 = {
  // AVAX (Avalanche)
  1: {
    chain: 'avax',
    tokenAddress: '0x0000000000000000000000000000000000000000',
    spokeAddress: '0x2aa8FeE178A79182C4b7c61EfeB4227Cb8843915',
  },
  // GoGoPool (Avalanche)
  2: {
    chain: 'avax',
    tokenAddress: '0x69260b9483f9871ca57f81a90d91e2f96c2cd11d',
    spokeAddress: '0xb14f2576BE100CFE3B274233091A841f1E040604',
  },
};

module.exports = {
  PROJECT_SLUG,
  HubPools,
  ONE_18_DP,
  EVERY_HOUR,
  EVERY_SECOND,
  GENERAL_LOAN_TYPE,
  loanManagerAddress,
  rewardsV2Address,
  RewardsTokenV2,
};
