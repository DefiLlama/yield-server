const factoryAbi = [
  {
    name: 'all_pairs',
    type: 'function',
    inputs: [],
    outputs: [
      // Cairo 0 workaround since the used Starknet.js doesn't support Cairo 2 types
      {
        name: 'pairs_len',
        type: 'felt',
      },
      {
        name: 'pairs',
        type: 'felt*',
      },
    ],
    state_mutability: 'view',
  },
];

const factory = {};
factoryAbi.forEach((i) => (factory[i.name] = i));

module.exports = {
  factory,
  factoryAbi,
};
