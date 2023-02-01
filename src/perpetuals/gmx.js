const axios = require('axios');
const { request, gql } = require('graphql-request');

const api = 'https://api.gmx.io';

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
  const prices = (await axios.get(`${api}/prices`)).data;
  const tokens = Object.values((await axios.get(`${api}/tokens`)).data);

  const markets = Object.keys(prices).map((m) => m.toLowerCase());

  const url = 'https://api.thegraph.com/subgraphs/name/gmx-io/gmx-stats';
  const fundingRates = (
    await request(url, q, {
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

    const frPrevious = (fr.endFundingRate - fr.startFundingRate) / timeDelta;

    return {
      marketplace: 'GMX',
      market: token.symbol,
      baseAsset: token.symbol,
      fundingRate: Number(token.fundingRate) / 1e6,
      fundingRatePrevious: frPrevious / 1e6,
      fundingTimePrevious: fr.endTimestamp,
      openInterest: oiLong + oiShort,
      indexPrice: price,
    };
  });
};
