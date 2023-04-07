const { getActiveTerms, getPastAndActiveTerms } = require('./subgraph.js');

const {
  totalValueLockedForTerms,
  earnedYieldByProviderForTerms,
  earnedYieldIfNextTermOfActiveTerm,
  apyBase,
} = require('./numbers.js');

const CHAINS = [
  {
    id: 1,
    name: 'ethereum',
    url: 'https://api.thegraph.com/subgraphs/name/barnbridge/sy-mainnet',
    address: '0xc67cb09d08521cD1dE6BAAC46824261eb1dB8800',
  },
  {
    id: 42161,
    name: 'arbitrum',
    url: 'https://api.thegraph.com/subgraphs/name/barnbridge/sy-arbitrum',
    address: '0xf878a060D4d51704B14e8f68B51185bF5DbFE3A1',
  },
  {
    id: 10,
    name: 'optimism',
    url: 'https://api.thegraph.com/subgraphs/name/barnbridge/sy-optimism',
    address: '0x45c158E0ee76c76E525BaB941991268249e95331',
  },
];

const apy = async () => {
  const pools = await Promise.all(
    CHAINS.map(async (chain) => {
      const pastAndActiveTerms = await getPastAndActiveTerms(chain.url);
      const activeTerms = await getActiveTerms(chain.url);

      const tvlUsd = await totalValueLockedForTerms(
        chain,
        pastAndActiveTerms,
        true
      );

      const earnedYieldsByProvider = await earnedYieldByProviderForTerms(
        chain,
        pastAndActiveTerms
      );

      return await Promise.all(
        pastAndActiveTerms.map(async (term) => {
          const earnedYield = earnedYieldIfNextTermOfActiveTerm(
            activeTerms,
            term.id,
            earnedYieldsByProvider[term.provider]
          );

          const _apyBase = apyBase(term, earnedYield);

          return {
            pool: `${term.id}`.toLowerCase(),
            chain: chain.name,
            project: 'barnbridge',
            symbol: term.underlyingSymbol,
            poolMeta: term.assetName,
            tvlUsd,
            apyBase: _apyBase,
            underlyingTokens: [term.underlying],
            url: `https://app.barnbridge.com/smart-yield/pools/details/?id=${term.id}&chainId=${chain.id}`,
          };
        })
      );
    })
  );

  return pools.flat();
};

module.exports = {
  apy,
  url: 'https://app.barnbridge.com/smart-yield/pools/',
  timetravel: false,
};
