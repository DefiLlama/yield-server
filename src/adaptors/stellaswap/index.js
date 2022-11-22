const sdk = require('@defillama/sdk');
const abi = require('./abi.js');

const utils = require('../utils');

const STELLA = '0x0e358838ce72d5e61e0018a2ffac4bec5f4c88d2';

const apy = async () => {
  const data = (
    await utils.getData('https://api.stellaswap.com/api/v1/coindix')
  ).result;

  return (
    await Promise.all(
      data.map(async (p, i) => {
        if (!p.active) return null;

        let token0;
        let token1;
        if (p.tokens.split('-').length === 2) {
          token0 = (
            await sdk.api.abi.call({
              target: p.address,
              abi: abi.find((m) => m.name === 'token0'),
              chain: 'moonbeam',
            })
          ).output;

          token1 = (
            await sdk.api.abi.call({
              target: p.address,
              abi: abi.find((m) => m.name === 'token1'),
              chain: 'moonbeam',
            })
          ).output;
        }

        return {
          pool: p.id,
          chain: utils.formatChain(p.chain),
          project: 'stellaswap',
          symbol: p.tokens,
          tvlUsd: p.tvl,
          apyBase: p.base * 100,
          apyReward: p.reward * 100,
          rewardTokens: [STELLA],
          underlyingTokens:
            p.tokens.split('-').length === 2 ? [token0, token1] : null,
        };
      })
    )
  ).filter(Boolean);
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.stellaswap.com/farm',
};
