const { getAddress } = require('ethers/lib/utils');

const contractAddresses = {
  ethereum: {
    // mBASIS: {
    //   address: getAddress('0x2a8c22E3b10036f3AEF5875d04f8441d4188b656'),
    //   dataFeed: getAddress('0x1615cBC603192ae8A9FF20E98dd0e40a405d76e4'),
    //   url: 'https://midas.app/mbasis',
    // },
    // mTBILL: {
    //   address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
    //   dataFeed: getAddress('0xfCEE9754E8C375e145303b7cE7BEca3201734A2B'),
    //   url: 'https://midas.app/mtbill',
    // },
    mBTC: {
      address: getAddress('0x007115416AB6c266329a03B09a8aa39aC2eF7d9d'),
      dataFeed: getAddress('0x9987BE0c1dc5Cd284a4D766f4B5feB4F3cb3E28e'),
      btcToUsdDataFeed: getAddress(
        '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c'
      ),
      url: 'https://midas.app/mbtc',
    },
    mEDGE: {
      address: getAddress('0xbB51E2a15A9158EBE2b0Ceb8678511e063AB7a55'),
      dataFeed: getAddress('0x20cd58F72cF1727a2937eB1816593390cf8d91cB'),
      url: 'https://midas.app/medge',
    },
    // mMEV: {
    //   address: getAddress('0x030b69280892c888670EDCDCD8B69Fd8026A0BF3'),
    //   dataFeed: getAddress('0x9BF00b7CFC00D6A7a2e2C994DB8c8dCa467ee359'),
    //   url: 'https://midas.app/https://midas.app/mmev',
    // },
  },
  //   mRe7YIELD: {
  //     address: getAddress('0x87C9053C819bB28e0D73d33059E1b3DA80AFb0cf'),
  //     dataFeed: getAddress('0x7E8C632ab231479886AF1Bc02B9D646e4634Da93'),
  //     url: 'https://midas.app/https://midas.app/mre7yield',
  //   },
  // },
  // base: {
  //   mBASIS: {
  //     address: getAddress('0x1C2757c1FeF1038428b5bEF062495ce94BBe92b2'),
  //     dataFeed: getAddress('0xD48D38Ec56CDB44c4281068129038A37F5Df04e5'),
  //     url: 'https://midas.app/mbasis',
  //   },
  //   mTBILL: {
  //     address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
  //     dataFeed: getAddress('0xcbCf1e67F1988e2572a2A620321Aef2ff73369f0'),
  //     url: 'https://midas.app/mtbill',
  //   },
  //   mEDGE: {
  //     address: getAddress('0x4089dC8b6637218f13465d28950A82a7E90cBE27'),
  //     dataFeed: getAddress('0xA7aB67Aa19F6b387BA12FcEdB6d1447E0c25897c'),
  //     url: 'https://midas.app/medge',
  //   },
  //   mMEV: {
  //     address: getAddress('0x141f0E9ed8bA2295254C9DF9476ccE7bC29172B1'),
  //     dataFeed: getAddress('0x2E0357e38FC7fAE9C29050AEf3744D4055490adA'),
  //     url: 'https://midas.app/https://midas.app/mmev',
  //   },
  //   mRe7YIELD: {
  //     address: getAddress('0x8459f6e174deE33FC72BDAE74a3080751eC92c27'),
  //     dataFeed: getAddress('0x54D4783F47889c73861152F027A1AEdf75d439d0'),
  //     url: 'https://midas.app/https://midas.app/mre7yield',
  //   },
  // },
  // sapphire: {
  //   mTBILL: {
  //     address: getAddress('0xDD629E5241CbC5919847783e6C96B2De4754e438'),
  //     dataFeed: getAddress('0x1075762cb143B495dbccE139712add38Eff19dAb'),
  //     url: 'https://midas.app/mtbill',
  //   },
  // },
};

module.exports = contractAddresses;
