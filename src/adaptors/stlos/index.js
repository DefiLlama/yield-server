const utils = require('../utils');
const sdk = require("@defillama/sdk");
const sTlosAbi = require("./sTlos.json");
const { ethers } = require("ethers");
// https://api.telos.net/v1/apy/evm using this API to get fluctuation APY for liquid staking

const sTLOS = "0xb4b01216a5bc8f1c8a33cd990a1239030e60c905";

async function poolsFunction(timestamp, block, chainBlocks) {
  const pooledTLOS = await sdk.api.abi.call({
      target: sTLOS,
      abi: sTlosAbi.totalAssets,
      chain: "telos",
  });
  
  const apyPercentage = await utils.getData(
    'https://api.telos.net/v1/apy/evm'
  );

  const sTlosPool = {
    pool: '0xb4b01216a5bc8f1c8a33cd990a1239030e60c905',
    chain: utils.formatChain('telos'),
    project: 'stlos',
    symbol: utils.formatSymbol('sTLOS'),
    tvlUsd: ethers.utils.formatEther(pooledTLOS.output),
    apy: apyPercentage
  };

  return [sTlosPool]; // sTLOS only has a single liquid pool
  
}

module.exports={
  telos: {
      timetravel: false,
      poolsFunction,
  },
  methodology: "Counts staked TLOS tokens in sTLOS contract and returns Liquid Staking APY.",
}