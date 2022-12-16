// adaptors which we don't want to be triggered +
// which we don't want to be included in the enriched dataset
// in case we have old values in db
// note (added cbridge cause their apy values are kinda fake given they move the positions to a different chain)
const excludeAdaptors = [
  'koyo-finance',
  'pony-finance',
  'optifi',
  'cbridge',
  'barnbridge', // temporarily cause they disbaled there current app. going to launch new version on arbi
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
