const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');

const api = 'https://api.gmx.io';

const chains = {
  arbitrum: {
    api: 'https://api.gmx.io',
    subgraph: sdk.graph.modifyEndpoint('E15amJKR3s5Wsaa4GeVhHcCzoo7jSu1Kk8SNqY4XXH9i'),
  },
  avalanche: {
    api: 'https://gmx-avax-server.uc.r.appspot.com',
    subgraph:
      sdk.graph.modifyEndpoint('9VZwoVRkrXVpbcaprAgFRkLnA3q682wx9JbBnFpLFYqy'),
  },
};

const q = gql`
  query MyQuery($tokens: [String]) {
    fundingRates(
      orderBy: endTimestamp
      orderDirection: desc
      where: { token_in: $tokens }
    ) {
      id
      endFundingRate
      endTimestamp
      startFundingRate
      startTimestamp
      token
    }
  }
`;

exports.getPerpData = async () => {
  const data = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const prices = (await axios.get(`${chains[chain].api}/prices`)).data;
      const tokens = Object.values(
        (await axios.get(`${chains[chain].api}/tokens`)).data
      );

      const markets = Object.keys(prices).map((m) => m.toLowerCase());

      const fundingRates = (
        await request(chains[chain].subgraph, q, {
          tokens: markets,
        })
      ).fundingRates.filter((p) => !p.id.includes('total'));

      return Object.entries(prices).map((i) => {
        const token = tokens.find((t) => t.id === i[0]).data;
        const price = Number(i[1]) / 10 ** 30;

        const oiLong = token.guaranteedUsd / 1e30;
        const oiShort = (token.globalShortSize / token.liqMaxPrice) * price;

        const fr = fundingRates.filter(
          (t) => t.token.toLowerCase() === i[0].toLowerCase()
        )[1]; // 0 -> most recent, 1 -> previous

        const timeDelta = (fr.endTimestamp - fr.startTimestamp) / (60 * 60);

        const frPrevious =
          (fr.endFundingRate - fr.startFundingRate) / timeDelta;

        return {
          marketplace: `GMX-${chain}`,
          market: `${token.symbol}-USD`,
          baseAsset: token.symbol,
          fundingRate: Number(token.fundingRate) / 1e6,
          fundingRatePrevious: frPrevious / 1e6,
          fundingTimePrevious: fr.endTimestamp,
          openInterest: oiLong + oiShort,
          indexPrice: price,
        };
      });
    })
  );
  return data.flat();
};
