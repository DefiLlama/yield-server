const arbitrum_query = {
  query: `
  query {
    pools(
      first: 1000, where: {
        _lendBalance_gt: 0,
        _paused: false,
        _expiry_gt: ${Math.floor(new Date().getTime() / 1000)}
      }
    ) {
      id
      _colToken
      _lendToken
      _type
      _feeRate
      _expiry
      _mintRatio
      _lendBalance
      _protocolFee
    }
  }
`,
};

const ethereum_query = {
  query: `
  query {
    pools(
      first: 1000, where: {
        _lendBalance_gt: 0,
        _paused: false,
        _expiry_gt: ${Math.floor(new Date().getTime() / 1000)}
      }
    ) {
      id
      _colToken
      _lendToken
      _type
      _feeRate
      _expiry
      _mintRatio
      _lendBalance
      _protocolFee
    }
  }
`,
};

exports.networkData = [
  {
    network: 'Ethereum',
    query: ethereum_query,
    type: 'v1-Ethereum',
  },
  {
    network: 'Arbitrum',
    query: arbitrum_query,
    type: 'v1-Arbitrum',
  },
];
