const metrics = [
  {
    inputs: [
      {
        name: 'token_add',
        type: 'felt',
      },
    ],
    name: 'get_protocol_stats',
    outputs: [
      {
        name: 'market_info',
        type: 'Market_Info',
      },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  {
    members: [
      {
        name: 'borrow_rate',
        offset: 0,
        type: 'Uint256',
      },
      {
        name: 'supply_rate',
        offset: 2,
        type: 'Uint256',
      },
      {
        name: 'staking_rate',
        offset: 4,
        type: 'Uint256',
      },
      {
        name: 'total_supply',
        offset: 6,
        type: 'Uint256',
      },
      {
        name: 'lent_assets',
        offset: 8,
        type: 'Uint256',
      },
      {
        name: 'total_borrow',
        offset: 10,
        type: 'Uint256',
      },
      {
        name: 'utilisation_per_market',
        offset: 12,
        type: 'Uint256',
      },
      {
        name: 'exchange_rate_rToken_to_asset',
        offset: 14,
        type: 'Uint256',
      },
      {
        name: 'exchange_rate_dToken_to_asset',
        offset: 16,
        type: 'Uint256',
      },
      {
        name: 'exchange_rate_asset_to_rToken',
        offset: 18,
        type: 'Uint256',
      },
      {
        name: 'exchange_rate_asset_to_dToken',
        offset: 20,
        type: 'Uint256',
      },
      {
        name: 'token_address',
        offset: 22,
        type: 'felt',
      },
    ],
    name: 'Market_Info',
    size: 23,
    type: 'struct',
  },
];

const metricsAbi = {};
metrics.forEach((i) => (metricsAbi[i.name] = i));

module.exports = {
  metricsAbi,
};
