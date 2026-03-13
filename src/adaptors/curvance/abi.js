const getDynamicMarketDataAbi = {
  name: 'getDynamicMarketData',
  type: 'function',
  inputs: [],
  outputs: [
    {
      type: 'tuple[]',
      components: [
        { name: '_address', type: 'address' },
        {
          name: 'tokens',
          type: 'tuple[]',
          components: [
            { name: '_address', type: 'address' },
            { name: 'totalSupply', type: 'uint256' },
            { name: 'collateral', type: 'uint256' },
            { name: 'debt', type: 'uint256' },
            { name: 'sharePrice', type: 'uint256' },
            { name: 'assetPrice', type: 'uint256' },
            { name: 'sharePriceLower', type: 'uint256' },
            { name: 'assetPriceLower', type: 'uint256' },
            { name: 'borrowRate', type: 'uint256' },
            { name: 'predictedBorrowRate', type: 'uint256' },
            { name: 'utilizationRate', type: 'uint256' },
            { name: 'supplyRate', type: 'uint256' },
            { name: 'liquidity', type: 'uint256' },
          ],
        },
      ],
    },
  ],
};

module.exports = { getDynamicMarketDataAbi };
