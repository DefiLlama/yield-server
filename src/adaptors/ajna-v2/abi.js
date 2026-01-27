module.exports = {
  factoryAbi: [
    {
      inputs: [],
      name: 'getDeployedPoolsList',
      outputs: [{ internalType: 'address[]', name: '', type: 'address[]' }],
      stateMutability: 'view',
      type: 'function',
    },
  ],

  poolAbi: [
    {
      inputs: [],
      name: 'quoteTokenAddress',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'collateralAddress',
      outputs: [{ internalType: 'address', name: '', type: 'address' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'interestRateInfo',
      outputs: [
        { internalType: 'uint256', name: 'interestRate_', type: 'uint256' },
        { internalType: 'uint256', name: 'interestRateUpdate_', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'debtInfo',
      outputs: [
        { internalType: 'uint256', name: 'debt_', type: 'uint256' },
        { internalType: 'uint256', name: 'accruedDebt_', type: 'uint256' },
        { internalType: 'uint256', name: 'debtInAuction_', type: 'uint256' },
        { internalType: 'uint256', name: 't0Debt2ToCollateral_', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],

  poolInfoUtilsAbi: [
    {
      inputs: [{ internalType: 'address', name: 'ajnaPool_', type: 'address' }],
      name: 'poolLoansInfo',
      outputs: [
        { internalType: 'uint256', name: 'poolSize_', type: 'uint256' },
        { internalType: 'uint256', name: 'loansCount_', type: 'uint256' },
        { internalType: 'address', name: 'maxBorrower_', type: 'address' },
        { internalType: 'uint256', name: 'pendingInflator_', type: 'uint256' },
        { internalType: 'uint256', name: 'pendingInterestFactor_', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [{ internalType: 'address', name: 'ajnaPool_', type: 'address' }],
      name: 'poolUtilizationInfo',
      outputs: [
        { internalType: 'uint256', name: 'poolMinDebtAmount_', type: 'uint256' },
        { internalType: 'uint256', name: 'poolCollateralization_', type: 'uint256' },
        { internalType: 'uint256', name: 'poolActualUtilization_', type: 'uint256' },
        { internalType: 'uint256', name: 'poolTargetUtilization_', type: 'uint256' },
      ],
      stateMutability: 'view',
      type: 'function',
    },
  ],
};
