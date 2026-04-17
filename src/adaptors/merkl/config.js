exports.networks = {
  1: 'ethereum',
  137: 'polygon',
  10: 'optimism',
  42161: 'arbitrum',
  1101: 'polygon_zkevm',
  8453: 'base',
  60808: 'bob',
  146: 'sonic',
  43114: 'avax',
  80094: 'berachain',
  56: 'bsc',
  42220: 'celo',
  143: 'monad',
  999: 'hyperevm',
  4114: 'citrea',
};

// Chain name aliases for pool-matching helpers. Some protocols use a
// different canonical chain name than the one declared in `networks`
// for the same chainId (e.g. `hyperliquid` vs `hyperevm` on 999).
// Helpers that index Merkl opportunities by chain should index under
// every alias so callers can match using whichever name they prefer.
exports.chainAliases = {
  hyperevm: ['hyperevm', 'hyperliquid'],
};
