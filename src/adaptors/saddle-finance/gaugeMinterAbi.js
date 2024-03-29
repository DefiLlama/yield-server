module.exports = [
  {
    name: 'Minted',
    inputs: [
      { name: 'recipient', type: 'address', indexed: true },
      { name: 'gauge', type: 'address', indexed: false },
      { name: 'minted', type: 'uint256', indexed: false },
    ],
    anonymous: false,
    type: 'event',
  },
  {
    name: 'UpdateMiningParameters',
    inputs: [
      { name: 'time', type: 'uint256', indexed: false },
      { name: 'rate', type: 'uint256', indexed: false },
    ],
    anonymous: false,
    type: 'event',
  },
  {
    name: 'CommitNextEmission',
    inputs: [{ name: 'rate', type: 'uint256', indexed: false }],
    anonymous: false,
    type: 'event',
  },
  {
    name: 'CommitEmergencyReturn',
    inputs: [{ name: 'admin', type: 'address', indexed: false }],
    anonymous: false,
    type: 'event',
  },
  {
    name: 'ApplyEmergencyReturn',
    inputs: [{ name: 'admin', type: 'address', indexed: false }],
    anonymous: false,
    type: 'event',
  },
  {
    name: 'CommitOwnership',
    inputs: [{ name: 'admin', type: 'address', indexed: false }],
    anonymous: false,
    type: 'event',
  },
  {
    name: 'ApplyOwnership',
    inputs: [{ name: 'admin', type: 'address', indexed: false }],
    anonymous: false,
    type: 'event',
  },
  {
    stateMutability: 'nonpayable',
    type: 'constructor',
    inputs: [
      { name: '_token', type: 'address' },
      { name: '_controller', type: 'address' },
      { name: '_emergency_return', type: 'address' },
      { name: '_admin', type: 'address' },
    ],
    outputs: [],
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'update_mining_parameters',
    inputs: [],
    outputs: [],
    gas: 155943,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'start_epoch_time_write',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    gas: 158152,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'future_epoch_time_write',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    gas: 158341,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'mint',
    inputs: [{ name: 'gauge_addr', type: 'address' }],
    outputs: [],
    gas: 268280,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'mint_many',
    inputs: [{ name: 'gauge_addrs', type: 'address[8]' }],
    outputs: [],
    gas: 1745103,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'mint_for',
    inputs: [
      { name: 'gauge_addr', type: 'address' },
      { name: '_for', type: 'address' },
    ],
    outputs: [],
    gas: 270873,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'toggle_approve_mint',
    inputs: [{ name: 'minting_user', type: 'address' }],
    outputs: [],
    gas: 38141,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'recover_balance',
    inputs: [{ name: '_coin', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
    gas: 14650,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'commit_next_emission',
    inputs: [{ name: '_rate_per_week', type: 'uint256' }],
    outputs: [],
    gas: 39683,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'commit_transfer_emergency_return',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [],
    gas: 39715,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'apply_transfer_emergency_return',
    inputs: [],
    outputs: [],
    gas: 41806,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'commit_transfer_ownership',
    inputs: [{ name: 'addr', type: 'address' }],
    outputs: [],
    gas: 39775,
  },
  {
    stateMutability: 'nonpayable',
    type: 'function',
    name: 'apply_transfer_ownership',
    inputs: [],
    outputs: [],
    gas: 41866,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'mining_epoch',
    inputs: [],
    outputs: [{ name: '', type: 'int128' }],
    gas: 2850,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'start_epoch_time',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    gas: 2880,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'rate',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    gas: 2910,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'committed_rate',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
    gas: 2940,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'is_start',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
    gas: 2970,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'token',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    gas: 3000,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'controller',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    gas: 3030,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'minted',
    inputs: [
      { name: 'arg0', type: 'address' },
      { name: 'arg1', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
    gas: 3592,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'allowed_to_mint_for',
    inputs: [
      { name: 'arg0', type: 'address' },
      { name: 'arg1', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    gas: 3622,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'future_emergency_return',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    gas: 3120,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'emergency_return',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    gas: 3150,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'admin',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    gas: 3180,
  },
  {
    stateMutability: 'view',
    type: 'function',
    name: 'future_admin',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
    gas: 3210,
  },
];
