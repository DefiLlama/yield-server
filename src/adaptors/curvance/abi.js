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

const getStaticMarketDataAbi = {
  name: 'getStaticMarketData',
  type: 'function',
  inputs: [],
  outputs: [
    {
      type: 'tuple[]',
      components: [
        { name: '_address', type: 'address' },
        { name: 'adapters', type: 'uint256[]' },
        { name: 'cooldownLength', type: 'uint256' },
        {
          name: 'tokens',
          type: 'tuple[]',
          components: [
            { name: '_address', type: 'address' },
            { name: 'name', type: 'string' },
            { name: 'symbol', type: 'string' },
            { name: 'decimals', type: 'uint8' },
            {
              name: 'asset',
              type: 'tuple',
              components: [
                { name: '_address', type: 'address' },
                { name: 'name', type: 'string' },
                { name: 'symbol', type: 'string' },
                { name: 'decimals', type: 'uint8' },
                { name: 'totalSupply', type: 'uint256' },
              ],
            },
            { name: 'collateralCap', type: 'uint256' },
            { name: 'debtCap', type: 'uint256' },
            { name: 'isListed', type: 'bool' },
            { name: 'mintPaused', type: 'bool' },
            { name: 'collateralizationPaused', type: 'bool' },
            { name: 'borrowPaused', type: 'bool' },
            { name: 'isBorrowable', type: 'bool' },
            { name: 'collRatio', type: 'uint256' },
            { name: 'maxLeverage', type: 'uint256' },
            { name: 'collReqSoft', type: 'uint256' },
            { name: 'collReqHard', type: 'uint256' },
            { name: 'liqIncBase', type: 'uint256' },
            { name: 'liqIncCurve', type: 'uint256' },
            { name: 'liqIncMin', type: 'uint256' },
            { name: 'liqIncMax', type: 'uint256' },
            { name: 'closeFactorBase', type: 'uint256' },
            { name: 'closeFactorCurve', type: 'uint256' },
            { name: 'closeFactorMin', type: 'uint256' },
            { name: 'closeFactorMax', type: 'uint256' },
            { name: 'adapters', type: 'uint256[2]' },
          ],
        },
      ],
    },
  ],
};

module.exports = { getDynamicMarketDataAbi, getStaticMarketDataAbi };
