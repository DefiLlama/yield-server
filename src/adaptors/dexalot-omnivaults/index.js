const axios = require('axios');
const utils = require('../utils');

const VAULT_YIELDS_URL = 'https://api.dexalot.com/api/stats/vaultyields';

const vaultPools = async () => {
  const { data } = await axios.get(VAULT_YIELDS_URL);
  return data.vaults.map((v) => {
    // token lists are coingecko ids, empty when a vault has no rewards
    const hasRewards = v.reward_tokens.length > 0;
    return {
      pool: `${v.address}-dexalot`.toLowerCase(),
      // the vault's share token on the Dexalot chain
      token: v.address.toLowerCase(),
      chain: utils.formatChain('dexalot'),
      project: 'dexalot-omnivaults',
      symbol: v.pair.replace('/', '-'),
      tvlUsd: v.tvl_usd,
      // fee apy is the vault's share of taker fees (last full UTC day, with a 7d average), trading pnl isn't included.
      // Reward apr is the incentive program on top, Dexalot's headline vault APY is the sum of the two
      apyBase: v.fee_apy_1d,
      apyBase7d: v.fee_apy_7d,
      apyReward: hasRewards ? v.reward_apr || null : null,
      rewardTokens: hasRewards ? v.reward_tokens : null,
      underlyingTokens: v.underlying_tokens.length > 0 ? v.underlying_tokens : undefined,
      volumeUsd1d: v.volume_usd_1d,
      volumeUsd7d: v.volume_usd_7d,
      poolMeta: v.name,
      url: `https://app.dexalot.com/omnivault/${v.id}`,
    };
  });
};

const apy = async () => (await vaultPools()).filter((p) => p.tvlUsd > 0);

module.exports = {
  protocolId: '9337',
  timetravel: false,
  apy,
  url: 'https://app.dexalot.com/vaults',
};
