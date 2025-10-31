const { getAddress } = require('ethers/lib/utils');

const BASE_ASSET_ORACLES = {
  BTC: {
    address: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
    chain: 'ethereum',
    decimals: 8,
  }, // BTC/USD on Ethereum
  SOL: {
    address: '0x4ffC43a60e009B551865A93d232E33Fce9f01507',
    chain: 'ethereum',
    decimals: 8,
  }, // SOL/USD on Ethereum
  // XRP: {
  //   address: '0xb549a837f95a79b83B3DA47fb64aAa9507Ee799C',
  //   chain: 'xrplevm',
  //   decimals: 18,
  // }, // XRP/USD on Xrplevm
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
  },
  sapphire: {
    mTBILL: {
      address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
      dataFeed: getAddress('0x1075762cb143B495dbccE139712add38Eff19dAb'),
      url: 'https://midas.app/mtbill',
    },
  },
  // xprlevm: {
  //   mXRP: {
  //     address: getAddress('0x06e0B0F1A644Bb9881f675Ef266CeC15a63a3d47'),
  //     dataFeed: getAddress('0xed4ff96DAF37a0A44356E81A3cc22908B3f06B40'),
  //     denomination: 'XRP',
  //     url: 'https://midas.app/mxrp',
  //   },
  // },
};

module.exports = { contractAddresses, BASE_ASSET_ORACLES };
