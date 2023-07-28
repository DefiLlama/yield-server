const arbitrum_query = `
  query {
    v1Arb_Pools(
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
      _borrowers
    }
  }
`;

const ethereum_query = `
  query {
    v1Eth_Pools(
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
      _borrowers
    }
  }
`;

exports.networkData = [
  {
    network: 'Ethereum',
    query: ethereum_query,
  },
  {
    network: 'Arbitrum',
    query: arbitrum_query,
  },
];
