// Vesu Protocol ABI definitions

const assetConfigAbi = {
  name: 'asset_config_unsafe',
  type: 'function',
  inputs: [
    {
      name: 'pool_id',
      type: 'felt'
    },
    {
      name: 'asset',
      type: 'felt'
    }
  ],
  outputs: [
    {
      name: 'config',
      type: 'felt'
    }
  ],
  state_mutability: 'view'
};

const interestRateAbi = {
  name: 'interest_rate',
  type: 'function',
  inputs: [
    {
      name: 'pool_id',
      type: 'felt'
    },
    {
      name: 'asset',
      type: 'felt'
    },
    {
      name: 'utilization',
      type: 'felt'
    },
    {
      name: 'last_updated',
      type: 'felt'
    },
    {
      name: 'last_full_utilization_rate',
      type: 'felt'
    }
  ],
  outputs: [
    {
      name: 'rate',
      type: 'felt'
    }
  ],
  state_mutability: 'view'
};

module.exports = {
  assetConfigAbi,
  interestRateAbi
};