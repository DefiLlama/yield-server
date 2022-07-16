// adaptors which we don't want to be triggered +
// which we don't want to be included in the enriched dataset
// in case we have old values in db
const excludeAdaptors = ['anchor', 'capsa', 'koyo-finance', 'rook'];

const excludePools = ['0xf4bfe9b4ef01f27920e490cea87fe2642a8da18d'];

const boundaries = {
  // we only insert pools into the db with a tvlUsd of minimum $1k
  tvlUsdDB: { lb: 1e3 },
  // we only get pools for the UI with a tvlUsd of minimum $10k and max ($20 billion)
  tvlUsdUI: { lb: 1e4, ub: 2e10 },
  // we only get pools for the UI with a maximum apy of 1million %
  apy: { lb: 0, ub: 1e6 },
};

module.exports = {
  excludeAdaptors,
  excludePools,
  boundaries,
};
