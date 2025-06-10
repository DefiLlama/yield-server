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
      {
        // aUSD
        id: 22,
        underlyingSymbol: 'AUSD',
        poolAddress: '0xc7DdB440666c144c2F27a3a5156D636Bacfc769C',
        tokenAddress: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
        spokeAddress: '0x666aea026bC606220ec6eb83a83D81881fA48e0f',
      },
      {
        // savUSD
        id: 23,
        underlyingSymbol: 'savUSD',
        poolAddress: '0xE6B7713854620076B5716E2743262D315bf8609D',
        tokenAddress: '0x06d47F3fb376649c3A9Dafe069B3D6E35572219E',
        spokeAddress: '0xe396E1246B7341Eb6EDA05DCfef9EaB9E661f80C',
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
        tokenAddress: '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599',
        spokeAddress: '0xb39c03297E87032fF69f4D42A6698e4c4A934449',
      },
      {
        // ATH_eth
        id: 32,
        underlyingSymbol: 'ATH',
        poolAddress: '0x391201cEC4F80e69C87Dee364d599c1FCAE3c363',
        tokenAddress: '0xbe0Ed4138121EcFC5c0E56B40517da27E6c5226B',
        spokeAddress: '0x91461B9117B3644609EeB0889ecc89Cab4644bb2',
      },
      {
        // pyUSD_eth
        id: 33,
        underlyingSymbol: 'pyUSD',
        poolAddress: '0x279b3E185F64e99141d4CE363657A5F3B5B32Fb9',
        tokenAddress: '0x6c3ea9036406852006290770BEdFcAbA0e23A0e8',
        spokeAddress: '0xff785fb7BfBbe03eD09089f73151AE563B211723',
      },
      {
        // rlUSD_eth
        id: 34,
        underlyingSymbol: 'rlUSD',
        poolAddress: '0x7178bF2a8A50153549e0d95A4C6Cb816448840F0',
        tokenAddress: '0x8292bb45bf1ee4d140127049757c2e0ff06317ed',
        spokeAddress: '0x7967B0fe720E676f41640855a203B409cEcc8f92',
      },
      {
        // wstETH_eth
        id: 35,
        underlyingSymbol: 'wstETH',
        poolAddress: '0xe7897052FAC4bfF9EB3ABc073CBC1e17Fce5709C',
        tokenAddress: '0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0',
        spokeAddress: '0xB3ABD8cc35619b907F3f2E974Fe3d43956AA7cda',
      },
      {
        // weETH_eth
        id: 36,
        underlyingSymbol: 'weETH',
        poolAddress: '0x4E6dD5E35638008cdB1E9004F3E952bCDd920E6D',
        tokenAddress: '0xCd5fE23C85820F7B72D0926FC9b05b43E359b7ee',
        spokeAddress: '0x63BCB60165E7EC30F03883Fcb800AEf304EE7eEa',
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
      {
        // AERO_base
        id: 37,
        underlyingSymbol: 'AERO',
        poolAddress: '0xb5327c35E083248E3a0f79122FaB3b6018e5584a',
        tokenAddress: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
        spokeAddress: '0x7Ace2Bc1C79954B56C65C7B326035C4468ac12BB',
      },
      {
        // cbETH_base
        id: 38,
        underlyingSymbol: 'cbETH',
        poolAddress: '0x0b09E1Ffd28040654021A85A49284597F3d0e41C',
        tokenAddress: '0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22',
        spokeAddress: '0x31A324D233AB3E73A6e1039D64907bBb2742606C',
      },
      {
        // wstETH_base
        id: 39,
        underlyingSymbol: 'wstETH',
        poolAddress: '0xC96820695217c7dd8F696f8892de76F7a48432CB',
        tokenAddress: '0xc1CBa3fCea344f92D9239c08C0568f6F2F0ee452',
        spokeAddress: '0x7c7961E590B7e005540B72238b739ae513B605fB',
      },
      {
        // weETH_base
        id: 40,
        underlyingSymbol: 'weETH',
        poolAddress: '0xf727EC8D6e565328f2cf0Ff8aC4e7c9e7f8d24B2',
        tokenAddress: '0x04c0599ae5a44757c0af6f9ec3b93da8976c150a',
        spokeAddress: '0x8D9aad601f384C596B9e2b9124a73b278DB4C51C',
      },
      {
        // VIRTUAL_base
        id: 41,
        underlyingSymbol: 'VIRTUAL',
        poolAddress: '0x331a1938f94af7bB41d57691119Aee416495202a',
        tokenAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b',
        spokeAddress: '0x9009c929873f0e68dbc253b16aC4c3E4426E6E35',
      },
      {
        // KAITO_base
        id: 42,
        underlyingSymbol: 'KAITO',
        poolAddress: '0x04C8B9d8AF87a6D670B646125B2D99740D8eBa5E',
        tokenAddress: '0x98d0baa52b2D063E780DE12F615f963Fe8537553',
        spokeAddress: '0x123f831a762A165107EE2e07416f4AA713dA9bFD',
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
      {
        // wBTC_arb
        id: 24,
        underlyingSymbol: 'WBTC',
        poolAddress: '0x3445055F633fEF5A64F852aaCD6dA76143aCA109',
        tokenAddress: '0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f',
        spokeAddress: '0x2d1c07209696456b7901949fdf81037016d541A5',
      },
      {
        // tBTC_arb
        id: 25,
        underlyingSymbol: 'tBTC',
        poolAddress: '0xdd9eFBf83572f5387381aD3A04b1318221d545A2',
        tokenAddress: '0x6c84a8f1c29108F47a79964b5Fe888D4f4D0dE40',
        spokeAddress: '0xDF2da9288C4D0aDF6c52CCbb5062b8C73fb19111',
      },
      {
        // wstETH_arb
        id: 26,
        underlyingSymbol: 'wstETH',
        poolAddress: '0x9f0c0aDEc9fd4ef946aCe1e2b4F32e49aE45C8F3',
        tokenAddress: '0x5979D7b546E38E414F7E9822514be443A4800529',
        spokeAddress: '0x74416b0121DAadFeb2A9C2306827CCf80a6EE097',
      },
      {
        // weETH_arb
        id: 27,
        underlyingSymbol: 'weETH',
        poolAddress: '0x78B4e5cda33C898b546dB7925162879E7bd2A9d1',
        tokenAddress: '0x35751007a407ca6FEFfE80b3cB397736D2cf4dbe',
        spokeAddress: '0x624363570A6b6Fee5531CcA341b794B286Af091c',
      },
      {
        // rsETH_arb
        id: 28,
        underlyingSymbol: 'rsETH',
        poolAddress: '0x60f2682Ab38e3C9a51b07fbd69f42Ad2Cfe731db',
        tokenAddress: '0x4186BFC76E2E237523CBC30FD220FE055156b41F',
        spokeAddress: '0xC0a3536E0b6799014A14664bA4370BBd5D0c7590',
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
      {
        // wstETH_pol
        id: 29,
        underlyingSymbol: 'wstETH',
        poolAddress: '0xD77b920A9c05B3e768FEaE0bcB5839cd224328fE',
        tokenAddress: '0x03b54A6e9a984069379fae1a4fC4dBAE93B3bCCD',
        spokeAddress: '0xa526f90c0CAab6A0E6085830e75b084cd3c84000',
      },
      {
        // LINK_pol
        id: 30,
        underlyingSymbol: 'LINK',
        poolAddress: '0x84C420D5e077cF0ed8a20c44d803C380172eD5D5',
        tokenAddress: '0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39',
        spokeAddress: '0x63ad90A703e95e39be7CB9e460C2b05870c982B8',
      },
      {
        // MaticX
        id: 31,
        underlyingSymbol: 'MaticX',
        poolAddress: '0x59023eFDB22B9d8b2C7aeD842aC1fd2f6110e5B5',
        tokenAddress: '0xfa68FB4628DFF1028CFEc22b4162FCcd0d45efb6',
        spokeAddress: '0xCB66564d0cF3D28B26a1b6D4eCb830D6E216a75a',
      },
      {
        // aUSD_pol
        id: 43,
        underlyingSymbol: 'aUSD',
        poolAddress: '0x34f1BA5808EB5Bf60c9B1C343d86e410466F4860',
        tokenAddress: '0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a',
        spokeAddress: '0xaB07AfCf16fecdCC3D83dB7513c7839aEd626322',
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
  // USDC (Arbitrum)
  3: {
    chain: 'arbitrum',
    tokenAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    spokeAddress: '0x88f15e36308ED060d8543DA8E2a5dA0810Efded2',
  },
  // POL (Polygon)
  4: {
    chain: 'polygon',
    tokenAddress: '0x0000000000000000000000000000000000000000',
    spokeAddress: '0xCD7eE494fa616FDbE38Aa0A9355E20b7215108Bf',
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
