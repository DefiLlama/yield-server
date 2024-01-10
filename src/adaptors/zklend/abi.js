const market = [
  {
    name: 'get_total_debt_for_token',
    type: 'function',
    inputs: [
      {
        name: 'token',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'debt',
        type: 'felt',
      },
    ],
    stateMutability: 'view',
    customInput: 'address',
  },
  {
    type: 'struct',
    name: 'MarketReserveData',
    members: [
      {
        name: 'enabled',
        type: 'bool',
      },
      {
        name: 'decimals',
        type: 'felt',
      },
      {
        name: 'z_token_address',
        type: 'address',
      },
      {
        name: 'interest_rate_model',
        type: 'address',
      },
      {
        name: 'collateral_factor',
        type: 'felt',
      },
      {
        name: 'borrow_factor',
        type: 'felt',
      },
      {
        name: 'reserve_factor',
        type: 'felt',
      },
      {
        name: 'last_update_timestamp',
        type: 'felt',
      },
      {
        name: 'lending_accumulator',
        type: 'felt',
      },
      {
        name: 'debt_accumulator',
        type: 'felt',
      },
      {
        name: 'current_lending_rate',
        type: 'felt',
      },
      {
        name: 'current_borrowing_rate',
        type: 'felt',
      },
      {
        name: 'raw_total_debt',
        type: 'felt',
      },
      {
        name: 'flash_loan_fee',
        type: 'felt',
      },
      {
        name: 'liquidation_bonus',
        type: 'felt',
      },
      {
        name: 'debt_limit',
        type: 'felt',
      },
    ],
  },
  {
    type: 'function',
    name: 'get_reserve_data',
    inputs: [
      {
        name: 'token',
        type: 'address',
      },
    ],
    outputs: [
      {
        type: 'MarketReserveData',
      },
    ],
    state_mutability: 'view',
  },
];
const marketAbi = {};
market.forEach((i) => (marketAbi[i.name] = i));

const erc20 = [
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [
      {
        name: 'account',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'balance',
        type: 'Uint256',
      },
    ],
    stateMutability: 'view',
    customInput: 'address',
  },
];
const erc20Abi = {};
erc20.forEach((i) => (erc20Abi[i.name] = i));

const irm = [
  {
    type: 'struct',
    name: 'ModelRates',
    members: [
      {
        name: 'lending_rate',
        type: 'felt',
      },
      {
        name: 'borrowing_rate',
        type: 'felt',
      },
    ],
  },
  {
    type: 'function',
    name: 'get_interest_rates',
    inputs: [
      {
        name: 'reserve_balance',
        type: 'felt',
      },
      {
        name: 'total_debt',
        type: 'felt',
      },
    ],
    outputs: [
      {
        name: 'rates',
        type: 'ModelRates',
      },
    ],
    state_mutability: 'view',
  },
];
const irmAbi = {};
irm.forEach((i) => (irmAbi[i.name] = i));

module.exports = {
  marketAbi,
  erc20Abi,
  irmAbi,
};
