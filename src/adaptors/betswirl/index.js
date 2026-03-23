const utils = require('../utils');

const gammaMerklesOpportunities = [
  {
    id: '646147034480640434'
  },
];

const getApy = async () => {
  return (
    await Promise.all(
      gammaMerklesOpportunities
        .map(async (gammaMerkleOpportunity) => {
          try {
            const merkleData = await utils.getData(`https://api.merkl.xyz/v4/opportunities/${gammaMerkleOpportunity.id}`);
            const chainName = merkleData.chain.name.toLowerCase();
            const tvlUsd = merkleData.tvl;
            const apr = merkleData.apr;
            const identifier = merkleData.identifier;
            const tokens = merkleData.tokens || [];
            const symbol = tokens.map((t) => t.symbol).join('-');
            const url = merkleData.depositUrl;

            const rewardTokens =
              merkleData.rewardsRecord?.breakdowns?.map((x) => x.token.address) || [];
            const underlyingTokens = tokens.map((t) => t.address);

            return {
              pool: `${identifier}-${chainName}`.toLowerCase(),
              chain: utils.formatChain(chainName),
              project: 'betswirl',
              symbol: utils.formatSymbol(symbol),
              tvlUsd: tvlUsd,
              apy: apr,
              rewardTokens,
              underlyingTokens,
              poolMeta: `Gamma vault ${symbol}`,
              url: url
            };
          } catch (error) {
            console.error(`Error processing opportunity ${gammaMerkleOpportunity.id}:`, error);
            return null;
          }
        })
    )
  ).filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy: getApy
};
