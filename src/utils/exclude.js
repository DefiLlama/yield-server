// adaptors which we don't want to be triggered +
// which we don't want to be included in the enriched dataset
// in case we have old values in db
// note (added cbridge cause their apy values are kinda fake given they move the positions to a different chain)
const excludeAdaptors = [
  'koyo-finance',
  'pony-finance',
  'optifi',
  'cbridge',
  'friktion',
  'armor', // is now ease.org
  'lachain-yield-market',
  'euler', // adapter is breaking since hack, need to fix,
  'ratio-finance',
  '0vix', // pausing cause of hack
  'rehold', // apy values are fake
  'deficurrent', // vaults deprecated
  'dogium-farm', // seems to be dead
  'zest-protocol', // tiny pools
  'hedge', // seems to be dead, ui not working
  'double-club', // seems to be dead
  'yieldwolf', // dead
  'hubble-exchange', // no live pools
  'yodeswap', // v1 deprecated
  'optyfi', // dead
  'rodeo', // exploited
  'fairfi', // seems dead
  'mole', // needs to be reimplement
  'luxsfi',
  'geist-finance',
];

const excludePools = [
  '0xf4bfe9b4ef01f27920e490cea87fe2642a8da18d',
  'DWmAv5wMun4AHxigbwuJygfmXBBe9WofXAtrMCRJExfb', // Solend COOL coin pool
  // ripae pools (reported by MathieuB as scam project, and definitely not noIL!)
  'ripae-seth-weth-42161',
  'ripae-peth-weth-42161',
  '0x3eed430cd45c5e2b45aa1adc609cc77c6728d45b', // mind-wavax on traderjoe, snowtrace shows tiny lp value, but tvl is huge
  '0x3c42B0f384D2912661C940d46cfFE1CD10F1c66F-ethereum', // test pool on curve? (CTDL-WBTC)
  '0x165ab553871b1a6b3c706e15b6a7bb29a244b2f3', // XSTUSD-WETH on uniswap
  '0xf81ebbc00b9bbc3a0b0cb1bc4e87ac157028698f', // nitrodoge on sushiswap, tvl on our side is way to large
  '0xEc54859519293B8784bc5Bf28144166f313618aF', // dai-o uniswap
  'BRnJFznuWEuqMZTHGKyWjYijugcj8wtb3oiLMyu2Tj4R', // usdh soldust pool
  '0xec54859519293b8784bc5bf28144166f313618af', // dai-o uniswap
  '0xE6D31ab5607eb7618a16B5923b67314d16BD350f-miMATIC-fantom', // decomissioned tarot pool
  // bunch of aave-v3 pools on fantom, are all frozen (updated adapter to consider frozen state, but need to add here
  // otherwise we' gonna see those pools on the UI for the next 7days. (can be removed afterwards))
  '0x191c10aa4af7c30e871e70c95db0e4eb77237530-fantom',
  '0x6d80113e533a2c0fe82eabd35f1875dcea89ea97-fantom',
  '0x078f358208685046a11c85e8ad32895ded33a249-fantom',
  '0xf329e36c7bf6e5e86ce2150875a84ce77f477375-fantom',
  '0xe50fa9b3c56ffb159cb0fca61f5c9d750e8128c8-fantom',
  '0x82e64f49ed5ec1bc6e43dad4fc8af9bb3a2312ee-fantom',
  '0x6ab707aca953edaefbc4fd23ba73294241490620-fantom',
  '0xc45a479877e1e9dfe9fcd4056c699575a1045daa-fantom',
  '0x625e7708f30ca75bfd92586e17077590c60eb4cd-fantom',
  '0x513c7e3a9c69ca3e22550ef58ac1c0088e918fff-fantom',
  '0xf0d17f404343D7Ba66076C818c9DC726650E2435-dot-dot-finance',
  '0xa3B615667CBd33cfc69843Bf11Fbb2A1D926BD46-6', // magpie ABNBC pool
  '0x1d03D8199f43ea030a5D1c2a5d4675d18581D129', // dino pool form unicrypt, jumped from 1mil to > 800mil in tvl
  '0x726e324c29a1e49309672b244bdc4ff62a270407000200000000000000000702', // USDC-XSGD balancer pool on polygon. can't find on UI
  '0xf4c0dd9b82da36c07605df83c8a416f11724d88b', // GNO-WETH on aura
  '0xa33c1963d74d203df6bffdfda3bff39a1d76e1d0', // sol pool on lyra
  '0x7a5011bf1dad77a23ec35ce04dcc2ac7d29963c5', // matic-peco
  '0x19D3364A399d251E894aC732651be8B0E4e85001', // ydai
  '0x09AA7178049Ba617119425A80faeee12dBe121de', // weth on klap
  '0x5f18C75AbDAe578b483E5F43f12a39cF75b973a9', // old usdc vault on yearn
  '0x152d62dccc2c7c7930c4483cc2a24fefd23c24c2-fantom',
  '0x5427f192137405e6a4143d1c3321359bab2dbd87-fantom',
  '0x7a5011bf1dad77a23ec35ce04dcc2ac7d29963c5',
  '0x45859D71D4caFb93694eD43a5ecE05776Fc2465d-dot-dot-finance', // until fixed
  '0xc3d088842dcf02c13699f936bb83dfbbc6f721ab', // bifrost veth v1
  '0x015908fec4ac33782d7bcd7a6ae88ab0ade405f4', //drop-usdc pool
  '0x7578aa78d5c5f622800d9205e942b12d353432b7',
  '0x05d3d04f1aeb77d591a0581827b148ea634c0d1c',
  '0xc1b228c22ca914069c7164e5489e8d79a9cbb922',
  '0xe50341e6f27a2514908f347e743119f3dfd84ad5',
  '0xb59A93eAB4059C58d33b0c29fE4Fa3F3433997cc',
  '0xB657B895B265C38c53FFF00166cF7F6A3C70587d',
  // curve exploit
  '0x8301AE4fc9c624d1D396cbDAa1ed877821D7C511-ethereum',
  '0xC4C319E2D4d66CcA4464C0c2B32c9Bd23ebe784e-ethereum',
  '0xc897b98272AA23714464Ea2A0Bd5180f1B8C0025-ethereum',
  '0x9848482da3Ee3076165ce6497eDA906E66bB85C5-ethereum',
  '0x4CF4f433e359a343648c480b2f3952FD64616a9a', // peth harvest
  '0x7ba1D55606900c5028Fb3BB82Fa0c198e3b0580E',
  '0x0DEA7dc835e2dB8E1fF8853577a5B8D5E5F55413',
  '0xB3D81Fad8f5092903592249d30cdeBD681057153',
  '0x80eF5eF7099C69bC9fcF952217240331F96bdF5F',
];

const boundaries = {
  // we only insert pools into the db with a tvlUsd of minimum $1k
  tvlUsdDB: { lb: 1e3, ub: 2e10 },
  // we only get pools for the UI with a tvlUsd of minimum $10k and max ($20 billion)
  tvlUsdUI: { lb: 1e4, ub: 2e10 },
  // we only get pools for the UI with a maximum apy of 1million %
  apy: { lb: 0, ub: 1e6 },
  // reading from database returns only pools which is max 7 days old
  age: 7,
};

module.exports = {
  excludeAdaptors,
  excludePools,
  boundaries,
};
