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
      { name: "borrow_rate", type: "Uint256" },
      { name: "_dummy0", type: "Uint256" },
      { name: "supply_rate", type: "Uint256" },
      { name: "_dummy1", type: "Uint256" },
      { name: "staking_rate", type: "Uint256" },
      { name: "_dummy2", type: "Uint256" },
      { name: "total_supply", type: "Uint256" },
      { name: "_dummy3", type: "Uint256" },
      { name: "lent_assets", type: "Uint256" },
      { name: "_dummy4", type: "Uint256" },
      { name: "total_borrow", type: "Uint256" },
      { name: "_dummy5", type: "Uint256" },
      { name: "utilisation_per_market", type: "Uint256" },
      { name: "_dummy6", type: "Uint256" },
      { name: "exchange_rate_rToken_to_asset", type: "Uint256" },
      { name: "_dummy7", type: "Uint256" },
      { name: "exchange_rate_dToken_to_asset", type: "Uint256" },
      { name: "_dummy8", type: "Uint256" },
      { name: "exchange_rate_asset_to_rToken", type: "Uint256" },
      { name: "_dummy9", type: "Uint256" },
      { name: "exchange_rate_asset_to_dToken", type: "Uint256" },
      { name: "_dummy10", type: "Uint256" },
      { name: "token_address", type: "felt" },
    ],
    stateMutability: 'view',
    type: 'function',
  },
];

const metricsAbi = {};
metrics.forEach((i) => (metricsAbi[i.name] = i));

module.exports = {
  metricsAbi,
  metrics
};
