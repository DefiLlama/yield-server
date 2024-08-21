const sdk = require('@defillama/sdk');
const cellarAbi = require('./cellar-v2p5.json');
const v2 = require('./v2');

const call = sdk.api.abi.call;

const abiViewPositionBalances = cellarAbi.find(
  (el) => el.name === 'viewPositionBalances'
);

async function getUnderlyingTokens(cellarAddress, cellarChain) {
  const result = (
    await call({
      target: cellarAddress,
      abi: abiViewPositionBalances,
      chain: cellarChain,
    })
  ).output;

  // dedupe, different positions may have the same underlying
  return [...new Set(result.assets)];
}

module.exports = {
  calcApy: v2.calcApy,
  getApy: v2.getApy,
  getApy7d: v2.getApy7d,
  getHoldingPosition: v2.getHoldingPosition,
  getUnderlyingTokens,
};
