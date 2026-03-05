const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const { config } = require('./config');
const BigNumber = require('bignumber.js');

// function getEstimatedAPR is misleading, it returns the estimated APY
const getEstimatedAPR =
  'function estimatedAPR() external view returns (uint256)';
const getTotalAssets = 'function totalAssets() external view returns (uint256)';

const getsUSDpData = async (chain, chainConfig) => {
  const { chainName, USDp, sUSDp } = chainConfig;
  let estimatedAPY;
  let totalAssets;
  if (chain === 'hyperevm') {
    const provider = new ethers.providers.JsonRpcProvider(
      'https://rpc.hyperliquid.xyz/evm'
    );
    const abi = [getEstimatedAPR, getTotalAssets];
    const contract = new ethers.Contract(sUSDp, abi, provider);
    [estimatedAPY, totalAssets] = await Promise.all([
      contract.estimatedAPR(),
      contract.totalAssets(),
    ]);
  } else {
    const api = new sdk.ChainApi({ chain });
    [estimatedAPY, totalAssets] = await Promise.all([
      api.call({
        abi: getEstimatedAPR,
        target: sUSDp,
      }),
      api.call({
        abi: getTotalAssets,
        target: sUSDp,
      }),
    ]);
  }

  const tvlUsd = new BigNumber(
    ethers.utils.formatUnits(totalAssets, 18)
  ).toNumber();
  const apyBase = new BigNumber(
    ethers.utils.formatUnits(estimatedAPY, 16)
  ).toNumber();

  return {
    pool: `${sUSDp}-parallel-v3`.toLowerCase(),
    chain: utils.formatChain(chainName),
    project: 'parallel-protocol-v3',
    symbol: 'sUSDp',
    tvlUsd: tvlUsd,
    apyBase: apyBase,
    rewardTokens: [USDp],
    underlyingTokens: [USDp],
    poolMeta: 'saving',
  };
};

const main = async () => {
  const markets = [];
  for (let [chain, data] of Object.entries(config)) {
    const result = await getsUSDpData(chain, data);
    markets.push(result);
  }
  return markets;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.parallel.best/earn',
};
