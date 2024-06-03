const utils = require('../utils');
const sdk = require('@defillama/sdk');

const sherlockV2ABI = require('./sherlockV2abi.json');

const SherlockV2Contract = '0x0865a889183039689034dA55c1Fd12aF5083eabF';

const apy = async () => {
  // Fetch APY
  const apyData = await utils.getData(
    'https://mainnet-indexer.sherlock.xyz/staking'
  );

  const v2TVL = (
    await sdk.api.abi.call({
      target: SherlockV2Contract,
      abi: sherlockV2ABI.abi.find((m) => m.name === 'totalTokenBalanceStakers'),
      chain: 'ethereum',
    })
  ).output;

  const usdcPool = {
    pool: 'sherlock-v2-usdc',
    chain: utils.formatChain('ethereum'),
    project: 'sherlock',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: v2TVL / 1e6,
    apy: apyData.usdc_apy,
    underlyingTokens: ['0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'],
  };

  return [usdcPool];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.sherlock.xyz/stake',
};
