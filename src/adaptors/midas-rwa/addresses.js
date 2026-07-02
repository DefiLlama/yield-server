const { getAddress } = require('ethers/lib/utils');

const BASE_ASSET_ORACLES = {
  BTC: {
    address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    chain: 'ethereum',
    decimals: 8,
  }, // BTC/USD on Ethereum
  ETH: {
    address: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
    chain: 'ethereum',
    decimals: 8,
  }, // ETH/USD on Ethereum
  SOL: {
    address: '0x4ffC43a60e009B551865A93d232E33Fce9f01507',
    chain: 'ethereum',
    decimals: 8,
  }, // SOL/USD on Ethereum
  XRP: {
    address: '0xb549a837f95a79b83B3DA47fb64aAa9507Ee799C',
    chain: 'xrplevm',
    decimals: 18,
  }, // XRP/USD on XRPL EVM
};

const contractAddresses = {
  ethereum: {
    mTBILL: {
      address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
      dataFeed: getAddress('0xfCEE9754E8C375e145303b7cE7BEca3201734A2B'),
      url: 'https://midas.app/mtbill',
    },
    mBASIS: {
      address: getAddress('0x2a8c22E3b10036f3AEF5875d04f8441d4188b656'),
      dataFeed: getAddress('0x1615cBC603192ae8A9FF20E98dd0e40a405d76e4'),
      url: 'https://midas.app/mbasis',
    },
    mBTC: {
      address: getAddress('0x007115416AB6c266329a03B09a8aa39aC2eF7d9d'),
      dataFeed: getAddress('0x9987BE0c1dc5Cd284a4D766f4B5feB4F3cb3E28e'),
      denomination: 'BTC',
      url: 'https://midas.app/mbtc',
    },
    mEDGE: {
      address: getAddress('0xbB51E2a15A9158EBE2b0Ceb8678511e063AB7a55'),
      dataFeed: getAddress('0x20cd58F72cF1727a2937eB1816593390cf8d91cB'),
      url: 'https://midas.app/medge',
    },
    mMEV: {
      address: getAddress('0x030b69280892c888670EDCDCD8B69Fd8026A0BF3'),
      dataFeed: getAddress('0x9BF00b7CFC00D6A7a2e2C994DB8c8dCa467ee359'),
      url: 'https://midas.app/mmev',
    },
    mAPOLLO: {
      address: getAddress('0x7CF9DEC92ca9FD46f8d86e7798B72624Bc116C05'),
      dataFeed: getAddress('0x9aEBf5d6F9411BAc355021ddFbe9B2c756BDD358'),
      url: 'https://midas.app/mapollo',
    },
    msyrupUSD: {
      address: getAddress('0x20226607b4fa64228ABf3072Ce561d6257683464'),
      dataFeed: getAddress('0x81c097e86842051B1ED4299a9E4d213Cb07f6f42'),
      url: 'https://midas.app/msyrupusd',
    },
    msyrupUSDp: {
      address: getAddress('0x2fE058CcF29f123f9dd2aEC0418AA66a877d8E50'),
      dataFeed: getAddress('0x7833397dA276d6B588e76466C14c82b2d733Cfb6'),
      url: 'https://midas.app/msyrupusdp',
    },
    mRe7YIELD: {
      address: getAddress('0x87C9053C819bB28e0D73d33059E1b3DA80AFb0cf'),
      dataFeed: getAddress('0x7E8C632ab231479886AF1Bc02B9D646e4634Da93'),
      url: 'https://midas.app/mre7yield',
    },
    mRe7BTC: {
      address: getAddress('0x9FB442d6B612a6dcD2acC67bb53771eF1D9F661A'),
      dataFeed: getAddress('0xB5D6483c556Bc6810b55B983315016Fcb374186D'),
      denomination: 'BTC',
      url: 'https://midas.app/mre7btc',
    },
    mWildUSD: {
      address: getAddress('0x605A84861EE603e385b01B9048BEa6A86118DB0a'),
      dataFeed: getAddress('0xe604a420388Fbf2693F2250db0DC84488EE99aA1'),
      url: 'https://midas.app/mwildusd',
    },
    mFARM: {
      address: getAddress('0xA19f6e0dF08a7917F2F8A33Db66D0AF31fF5ECA6'),
      dataFeed: getAddress('0x9f49B0980B141b539e2A94Ec0864Faf699fF9524'),
      url: 'https://midas.app/mfarm',
    },
    mHYPER: {
      address: getAddress('0x9b5528528656DBC094765E2abB79F293c21191B9'),
      dataFeed: getAddress('0x92004DCC5359eD67f287F32d12715A37916deCdE'),
      url: 'https://midas.app/mhyper',
    },
    mFONE: {
      address: getAddress('0x238a700eD6165261Cf8b2e544ba797BC11e466Ba'),
      dataFeed: getAddress('0xCF4e49f5e750Af8F2f9Aa1642B68E5839D9c1C00'),
      url: 'https://midas.app/mfone',
    },
    mEVUSD: {
      address: getAddress('0x548857309BEfb6Fb6F20a9C5A56c9023D892785B'),
      dataFeed: getAddress('0x508Fe9556C7919E64406bB4042760d7Bb1F40fC9'),
      url: 'https://midas.app/mevusd',
    },
    mHyperETH: {
      address: getAddress('0x5a42864b14C0C8241EF5ab62Dae975b163a2E0C1'),
      dataFeed: getAddress('0xbD560c1E87752717C34912D128168BfE26021EA2'),
      denomination: 'ETH',
      url: 'https://midas.app/mhypereth',
    },
    mHyperBTC: {
      address: getAddress('0xC8495EAFf71D3A563b906295fCF2f685b1783085'),
      dataFeed: getAddress('0xb75B82b2012138815d1A2c4aB5B8b987da043157'),
      denomination: 'BTC',
      url: 'https://midas.app/mhyperbtc',
    },
    mPortofino: {
      address: getAddress('0x9004B9890D6B901A17F734efe028b1Be5bd6CD22'),
      dataFeed: getAddress('0x21f3BCfa912F674c2af3bED5BF8E47A3f40EA749'),
      url: 'https://midas.app/mportofino',
    },
    mKRalpha: {
      address: getAddress('0xE70B5Eb021Dc3AF653D61fd792D8f0B60F36c493'),
      dataFeed: getAddress('0x72e4549f3647426794149554625Bc0827C77D3Aa'),
      url: 'https://midas.app/mkralpha',
    },
    mROX: {
      address: getAddress('0x67E1F506B148d0Fc95a4E3fFb49068ceB6855c05'),
      dataFeed: getAddress('0x2c7d47c56015be6aa8442Da78796a965928E7c4e'),
      url: 'https://midas.app/mrox',
    },
    mM1USD: {
      address: getAddress('0xCc5C22C7A6BCC25e66726AeF011dDE74289ED203'),
      dataFeed: getAddress('0xF1aBD1a4Fc5fa2848Cf3763FBE7B0DF366da9279'),
      url: 'https://midas.app/mm1usd',
    },
    mevBTC: {
      address: getAddress('0xb64C014307622eB15046C66fF71D04258F5963DC'),
      dataFeed: getAddress('0x56814399caaEDCEE4F58D2e55DA058A81DDE744f'),
      url: 'https://midas.app/mevbtc',
    },
  },
  base: {
    mBASIS: {
      address: getAddress('0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2'),
      dataFeed: getAddress('0xD48D38Ec56CDB44c4281068129038A37F5Df04e5'),
      url: 'https://midas.app/mbasis',
    },
    mTBILL: {
      address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
      dataFeed: getAddress('0xcbCf1e67F1988e2572a2A620321Aef2ff73369f0'),
      url: 'https://midas.app/mtbill',
    },
    mEDGE: {
      address: getAddress('0x4089dC8b6637218f13465d28950A82a7E90cBE27'),
      dataFeed: getAddress('0xA7aB67Aa19F6b387BA12FcEdB6d1447E0c25897c'),
      url: 'https://midas.app/medge',
    },
    mMEV: {
      address: getAddress('0x141f0E9ed8bA2295254C9DF9476ccE7bC29172B1'),
      dataFeed: getAddress('0x2E0357e38FC7fAE9C29050AEf3744D4055490adA'),
      url: 'https://midas.app/mmev',
    },
    mRE7: {
      address: getAddress('0x8459f6e174deE33FC72BDAE74a3080751eC92c27'),
      dataFeed: getAddress('0x54D4783F47889c73861152F027A1AEdf75d439d0'),
      url: 'https://midas.app/mre7',
    },
    mEVUSD: {
      address: getAddress('0xccbad2823328BCcAEa6476Df3Aa529316aB7474A'),
      dataFeed: getAddress('0x030b69280892c888670EDCDCD8B69Fd8026A0BF3'),
      url: 'https://midas.app/mevusd',
    },
  },
  sapphire: {
    mTBILL: {
      address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
      dataFeed: getAddress('0x1075762cb143B495dbccE139712add38Eff19dAb'),
      url: 'https://midas.app/mtbill',
    },
  },
  arbitrum: {
    mTBILL: {
      address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
      dataFeed: getAddress('0x8B6Dd8573FF97C08dD731B0A55E51E897aBeD03E'),
      url: 'https://midas.app/mtbill',
    },
    mBASIS: {
      address: getAddress('0x2448Cf256192Ee8e122E52026758Ae28398AfB4F'),
      dataFeed: getAddress('0xF675E328d4AAe03ca97a965fFa32498741Bc6947'),
      url: 'https://midas.app/mbasis',
    },
    mEDGE: {
      address: getAddress('0x130F99c2396e02DBaaa4c1643B10e06EcFe7eDAB'),
      dataFeed: getAddress('0xE3118A926cde694bFd8D2dCb894dcBEF443961EB'),
      url: 'https://midas.app/medge',
    },
    mMEV: {
      address: getAddress('0xeCacb5434F05A548FAf92a31874e0c014bEeee91'),
      dataFeed: getAddress('0x2da917Ab125B0e88dB1eb896ebdA93a31FA2b804'),
      url: 'https://midas.app/mmev',
    },
    mRE7: {
      address: getAddress('0x27329B57666413b84dcb872fe611eDbFe9A1a9ad'),
      dataFeed: getAddress('0xb7860740190BAf70eFd38B9c3db0CCeb88525315'),
      url: 'https://midas.app/mre7',
    },
  },
  plume_mainnet: {
    mTBILL: {
      address: getAddress('0xE85f2B707Ec5Ae8e07238F99562264f304E30109'),
      dataFeed: getAddress('0x73a64469E0974371005ca0f60Dfc10405613b411'),
      url: 'https://midas.app/mtbill',
    },
    mBASIS: {
      address: getAddress('0x0c78Ca789e826fE339dE61934896F5D170b66d78'),
      dataFeed: getAddress('0x7588139737f32A6da49b9BB03A0a91a45603b45F'),
      url: 'https://midas.app/mbasis',
    },
    mEDGE: {
      address: getAddress('0x69020311836D29BA7d38C1D3578736fD3dED03ED'),
      dataFeed: getAddress('0xa30e78AF094EFC51434693803fEE1D77f568321E'),
      url: 'https://midas.app/medge',
    },
    mMEV: {
      address: getAddress('0x7d611dC23267F508DE90724731Dc88CA28Ef7473'),
      dataFeed: getAddress('0x06fa9188680D8487e2b743b182CCc39654211C84'),
      url: 'https://midas.app/mmev',
    },
  },
  etlk: {
    mTBILL: {
      address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
      dataFeed: getAddress('0x2bDC9c452a4F52DfFD92B0cad371aCbCaeabf918'),
      url: 'https://midas.app/mtbill',
    },
    mBASIS: {
      address: getAddress('0x2247B5A46BB79421a314aB0f0b67fFd11dd37Ee4'),
      dataFeed: getAddress('0xF6Ca9280cAF31Ce24b7d9f6A96E331b3830797fb'),
      url: 'https://midas.app/mbasis',
    },
    mMEV: {
      address: getAddress('0x5542F82389b76C23f5848268893234d8A63fd5c8'),
      dataFeed: getAddress('0xB26f6F2821F85112aD0f452d18265Ce9BdC73aCE'),
      url: 'https://midas.app/mmev',
    },
    mRE7: {
      address: getAddress('0x733d504435a49FC8C4e9759e756C2846c92f0160'),
      dataFeed: getAddress('0x82d4F923214959C84Cf026f727cA6C9FCa6B4454'),
      url: 'https://midas.app/mre7',
    },
  },
  rsk: {
    mTBILL: {
      address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
      dataFeed: getAddress('0x088A4bE7e9b164241cd4b9cAdeEa60999c2CE916'),
      url: 'https://midas.app/mtbill',
    },
    mBTC: {
      address: getAddress('0xEF85254Aa4a8490bcC9C02Ae38513Cae8303FB53'),
      dataFeed: getAddress('0xa3A252Babc8A576660c6B8B9e3bD096D2f5017cE'),
      denomination: 'BTC',
      url: 'https://midas.app/mbtc',
    },
    mHyperBTC: {
      address: getAddress('0x7F71f02aE0945364F658860d67dbc10c86Ca3a3C'),
      dataFeed: getAddress('0xE1d9eF8784F0feDcf4e30105Aa17448AcBE7F367'),
      denomination: 'BTC',
      url: 'https://midas.app/mhyperbtc',
    },
  },
  katana: {
    mRE7SOL: {
      address: getAddress('0xC6135d59F8D10c9C035963ce9037B3635170D716'),
      dataFeed: getAddress('0x001b3731c706fEd93BDA240A5BF848C28ae1cC12'),
      denomination: 'SOL',
      url: 'https://midas.app/mre7sol',
    },
    mHYPER: {
      address: getAddress('0x926a8a63Fa1e1FDBBEb811a0319933B1A0F1EDbb'),
      dataFeed: getAddress('0xb670C738Fb751eef7400F088D17391D54b83023d'),
      url: 'https://midas.app/mhyper',
    },
  },
  xrplevm: {
    mXRP: {
      address: getAddress('0x06e0B0F1A644Bb9881f675Ef266CeC15a63a3d47'),
      dataFeed: getAddress('0xed4ff96DAF37a0A44356E81A3cc22908B3f06B40'),
      denomination: 'XRP',
      url: 'https://midas.app/mxrp',
    },
  },
  bsc: {
    mXRP: {
      address: getAddress('0xc8739fbBd54C587a2ad43b50CbcC30ae34FE9e34'),
      dataFeed: getAddress('0x583970971EFcEBfcebD3b530E436B8fEEb3D43C7'),
      denomination: 'XRP',
      url: 'https://midas.app/mxrp',
    },
  },
  monad: {
    mEDGE: {
      address: getAddress('0x1c8eE940B654bFCeD403f2A44C1603d5be0F50Fa'),
      dataFeed: getAddress('0xf0202EFbaF185B451b4be3b36988b258d42f8E24'),
      url: 'https://midas.app/medge',
    },
    mHYPER: {
      address: getAddress('0xd90F6bFEd23fFDE40106FC4498DD2e9EDB95E4e7'),
      dataFeed: getAddress('0x8Faab939BF96308846d9B273fE50DED16ae33fF2'),
      url: 'https://midas.app/mhyper',
    },
    mHyperBTC: {
      address: getAddress('0xF7Cf282eC810fDed974F99c0163E792f432892BC'),
      dataFeed: getAddress('0xf91288dC7F33e6f4aD3B62090A86b8978B48b01c'),
      denomination: 'BTC',
      url: 'https://midas.app/mhyperbtc',
    },
  },
  plasma: {
    mHYPER: {
      address: getAddress('0xb31BeA5c2a43f942a3800558B1aa25978da75F8a'),
      dataFeed: getAddress('0x2EB410e4cb94E2E9E3cdE3F7b405BE4fCC076Bc9'),
      url: 'https://midas.app/mhyper',
    },
  },
  '0g': {
    mEDGE: {
      address: getAddress('0xA1027783fC183A150126b094037A5Eb2F5dB30BA'),
      dataFeed: getAddress('0xcbf46Aa4b5bAe5850038D9dF4661a58e85CEDC7e'),
      url: 'https://midas.app/medge',
    },
  },
  tac: {
    mRE7: {
      address: getAddress('0x0a72ED3C34352Ab2dd912b30f2252638C873D6f0'),
      dataFeed: getAddress('0x2cBaa3F25Aae8b03aE2b62f9630d0BA63dF1Cf09'),
      url: 'https://midas.app/mre7',
    },
  },
  optimism: {
    mRe7ETH: {
      address: getAddress('0xE7Ba07519dFA06e60059563F484d6090dedF21B3'),
      dataFeed: getAddress('0x46129d0863667b1159C55F0B43b898bc3352130a'),
      url: 'https://midas.app/mre7eth',
    },
  },
};

module.exports = { contractAddresses, BASE_ASSET_ORACLES };
