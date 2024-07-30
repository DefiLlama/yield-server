const { gql, request } = require('graphql-request');
const sdk = require('@defillama/sdk');

const SUBGRAPH_URL =
  'https://api.studio.thegraph.com/query/70783/bitu-protocol/version/latest';

const BITU = '0x654a32542a84bea7d2c2c1a1ed1aaaf26888e6bd';
const sBITU = '0x61183a27ab5FDaCC4D46F5aF9Eb9E6A93afd76d4';

const Query = gql`
  query RewardTotal {
    rewardTotal(id: "BITU") {
      dyr
    }
  }
`;

const apy = async () => {
  const {
    rewardTotal: { dyr },
  } = await request(SUBGRAPH_URL, Query);

  const totalAssets =
    (
      await sdk.api.abi.call({
        target: sBITU,
        abi: 'uint:totalAssets',
        chain: 'bsc',
      })
    ).output / 1e18;

  return [
    {
      pool: '0x61183a27ab5FDaCC4D46F5aF9Eb9E6A93afd76d4',
      project: 'bitu-protocol',
      chain: 'bsc',
      symbol: 'sBITU',
      tvlUsd: totalAssets,
      apyBase: (Math.pow(1 + +dyr, 365) - 1) * 100,
    },
  ];
};

module.exports = {
  apy: apy,
  url: 'https://bitu.io',
};
