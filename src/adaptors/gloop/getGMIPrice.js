const abiGMI = require('./abi/abiGMI.json');

const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const {ADDRESSES, CHAIN} = require('./Constants');

/**
 * Gets GMI price in USD from GMI token contract
 * Formula: GMI price = totalControlledValue / totalSupply
 */
const getGMIPrice = async () => {
  try {
    // Get total supply of GMI tokens
    const totalSupplyResult = await sdk.api.abi.call({
      target: ADDRESSES.GMI,
      abi: abiGMI.find((m) => m.name === 'totalSupply'),
      chain: CHAIN,
    });

    // Get total controlled value (in USD, with 18 decimals)
    const totalControlledValueResult = await sdk.api.abi.call({
      target: ADDRESSES.GMI,
      abi: abiGMI.find((m) => m.name === 'totalControlledValue'),
      params: [false], // roundUp = false
      chain: CHAIN,
    });

    const totalSupply = new BigNumber(totalSupplyResult.output);
    const totalControlledValue = new BigNumber(
      totalControlledValueResult.output
    );

    if (totalSupply.isZero()) {
      console.warn('GMI total supply is zero');
      return 0;
    }

    // GMI price = (totalControlledValue * 100000) / totalSupply / 100000
    // This matches the frontend calculation
    const gmiPrice = totalControlledValue
      .multipliedBy(100000)
      .dividedBy(totalSupply)
      .dividedBy(100000);

    return gmiPrice.toNumber();
  } catch (error) {
    console.error('Error fetching GMI price:', error);
    return 0;
  }
};

module.exports = {
  getGMIPrice,
};
