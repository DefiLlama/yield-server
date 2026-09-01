const arbitrum_query = {
  query: `
  query {
    pools(
      first: 1000, where: {
        lendBalance_gt: 0,
        paused: false,
        expiry_gt: ${Math.round(new Date().getTime() / 1000)}
      }
    ) {
      id
      colToken
      lendToken
      feeType
      startRate
      poolType
      expiry
      mintRatio
      lendBalance
      protocolFee
    }
  }
`,
};

const ethereum_query = {
  query: `
  query {
    pools(
      first: 1000, where: {
        lendBalance_gt: 0,
        paused: false,
        expiry_gt: ${Math.round(new Date().getTime() / 1000)}
      }
    ) {
      id
      colToken
      lendToken
      feeType
      startRate
      poolType
      expiry
      mintRatio
      lendBalance
      borrowers
      protocolFee
    }
  }
`,
};

exports.networkData = [
  {
    network: 'Ethereum',
    query: ethereum_query,
    type: 'v2-Ethereum',
  },
  {
    network: 'Arbitrum',
    query: arbitrum_query,
    type: 'v2-Arbitrum',
  },
];
