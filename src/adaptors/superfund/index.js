const sdk = require('@defillama/sdk');
const {
  CHAIN_ID,
  VAULT,
  VAULT_ABI,
  CHAIN,
  USDC_TOKEN,
} = require('./constants');
const utils = require('../utils');

const SUPERFUND_API_URL = `https://api.funds.superlend.xyz/vaults/rate/${VAULT}/${CHAIN_ID}`;
const URL = 'https://funds.superlend.xyz/super-fund/base';
const getApy = async () => {
  const data = (await utils.getData(SUPERFUND_API_URL))?.data;

  const base_rate = data.base_apy;
  const reward_rate = data.rewards_apy;

  const tvl = (
    await sdk.api.abi.call({
      target: VAULT,
      abi: VAULT_ABI.find((m) => m.name === 'totalAssets'),
      chain: CHAIN,
    })
  ).output;
  const tvlUsd = tvl / 10 ** 6;

  return [
    {
      pool: `${VAULT}-${CHAIN}`,
      chain: CHAIN,
      project: 'superfund',
      symbol: 'USDC',
      tvlUsd,
      apyBase: base_rate,
      apyReward: reward_rate,
      underlyingTokens: [USDC_TOKEN],
      rewardTokens: reward_rate > 0 ? [USDC_TOKEN] : [],
      url: URL,
    },
  ];
};

const apy = async () => {
  return await getApy();
};

module.exports = {
  apy,
};
