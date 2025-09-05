const utils = require('../utils')
const { getERC4626Info } = require('../utils');

const SUPPORTED_PROTOCOLS = {
  ethereum: ['curvelend', 'fraxlend']
};

const fetchPairsForProtocol = async (chain, protocol) => {
  try {
    const response = await utils.getData(`https://api.hippo.army/v1/protocols/${chain}/${protocol}/pairs`);
    return response.pairs || [];
  } catch (error) {
    console.error(`Error fetching ${protocol} pairs for ${chain}:`, error);
    return [];
  }
};

const formatPair = (pair, chain, protocol) => {
  const apyRewardBorrow = pair.rewards.reduce((total, reward) => {
    return total + parseFloat(reward.apr);
  }, 0);

  const symbol = `${pair.underlying_token.symbol}`;

  return {
    pool: `${pair.address.toLowerCase()}-${chain}`,
    chain: utils.formatChain(chain),
    project: 'resupply',
    symbol: utils.formatSymbol(symbol),
    tvlUsd: parseFloat(pair.total_underlying),
    mintedCoin: pair.debt_token.symbol,
    apyBase: parseFloat(pair.base_apr),
    apyBaseBorrow: parseFloat(pair.borrow_cost_apr),
    apyRewardBorrow: apyRewardBorrow,
    totalSupplyUsd: parseFloat(pair.total_underlying),
    totalBorrowUsd: parseFloat(pair.total_debt),
    debtCeilingUsd: parseFloat(pair.borrow_limit),
    ltv: parseFloat(pair.total_underlying) > 0 ? parseFloat(pair.total_debt) / parseFloat(pair.total_underlying) : 0,
    underlyingTokens: [pair.underlying_token.address],
    rewardTokens: pair.rewards.map(reward => reward.token_address),
    poolMeta: `${protocol.charAt(0).toUpperCase() + protocol.slice(1)} - ${pair.pair_collateral_token.symbol} collateral`,
    url: 'https://resupply.fi/supply',
  };
};

const main = async () => {
  const allPools = [];

  for (const [chain, protocols] of Object.entries(SUPPORTED_PROTOCOLS)) {
    for (const protocol of protocols) {
      const pairs = await fetchPairsForProtocol(chain, protocol);
      const formattedPairs = pairs.map(pair => formatPair(pair, chain, protocol));
      allPools.push(...formattedPairs);
    }
  }
  const sreusd = await getERC4626Info(
    '0x557AB1e003951A73c12D16F0fEA8490E39C33C35',
    'ethereum'
  );

  return allPools
    .concat([
      {
        symbol: 'sreUSD',
        pool: `${sreusd.pool}-ethereum`,
        project: 'resupply',
        chain: 'Ethereum',
        tvlUsd: sreusd.tvl / 1e18,
        apyBase: sreusd.apyBase,
        poolMeta: 'Savings reUSD',
        url: 'https://resupply.fi/supply',
      },
    ])
    .filter(pool => utils.keepFinite(pool));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://resupply.fi/',
};