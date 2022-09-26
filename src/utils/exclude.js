// adaptors which we don't want to be triggered +
// which we don't want to be included in the enriched dataset
// in case we have old values in db
const excludeAdaptors = ['koyo-finance', 'pony-finance'];

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
