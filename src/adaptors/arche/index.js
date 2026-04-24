const sdk = require('@defillama/sdk');
const utils = require('../utils');

const VAULT = '0x33FfC177A7278FF84aaB314A036bC7b799B7Cc15';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const CHAIN = 'ethereum';

const getApy = async () => {
  const { output: totalAssets } = await sdk.api.abi.call({
    target: VAULT,
    abi: 'uint256:totalAssets',
    chain: CHAIN,
  });

  const { apr } = await utils.getData('https://arche.money/api/apy');
  if (!Number.isFinite(apr)) {
    throw new Error(`arche.money/api/apy returned non-finite apr: ${apr}`);
  }

  return [
    {
      pool: `${VAULT}-${CHAIN}`.toLowerCase(),
      chain: utils.formatChain(CHAIN),
      project: 'arche',
      symbol: utils.formatSymbol('arUSD'),
      tvlUsd: Number(totalAssets) / 1e6,
      apyBase: apr * 100,
      underlyingTokens: [utils.formatAddress(USDC)],
      token: utils.formatAddress(VAULT),
      url: 'https://arche.money',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://arche.money',
};
