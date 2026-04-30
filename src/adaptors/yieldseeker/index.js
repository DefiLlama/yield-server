const axios = require('axios');
const utils = require('../utils');
const { getMerklRewardsByIdentifier } = require('../merkl/merkl-by-identifier');

const PROJECT = 'yieldseeker';
const CHAIN = 'base';
const API_URL = 'https://api.yieldseeker.xyz/v1/agent-analytics';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Merkl uses this EOA as the identifier for the YieldSeeker opportunity
const MERKL_IDENTIFIER = '0x960f6ca8f4bf67bd88fc1065ba69143c8214798f';

const apy = async () => {
  const { data } = await axios.get(API_URL);
  const agents = data.agentAnalytics || [];

  // Compute TVL-weighted average APY across all active agents
  let totalTvlRaw = 0;
  let weightedApy = 0;

  for (const agent of agents) {
    const tvlRaw = Number(agent.snapshot?.totalValueBase || 0);
    if (tvlRaw === 0) continue;

    const apy7d = Number(agent.snapshot?.apy7d || 0);
    totalTvlRaw += tvlRaw;
    weightedApy += apy7d * tvlRaw;
  }

  if (totalTvlRaw === 0) return [];

  const tvlUsd = totalTvlRaw / 1e6;
  // apy7d is a decimal fraction (0.15 = 15%)
  const apyBase = (weightedApy / totalTvlRaw) * 100;

  // Fetch merkl rewards by identifier (ENCOMPASSING type, not matched by protocol ID)
  const merklRewards = await getMerklRewardsByIdentifier(
    MERKL_IDENTIFIER,
    CHAIN
  );

  const pool = {
    pool: `${MERKL_IDENTIFIER}-${CHAIN}`,
    chain: utils.formatChain(CHAIN),
    project: PROJECT,
    symbol: 'USDC',
    tvlUsd,
    apyBase,
    underlyingTokens: [USDC],
    url: 'https://app.yieldseeker.xyz',
  };

  if (merklRewards && merklRewards.apyReward > 0) {
    pool.apyReward = merklRewards.apyReward;
    pool.rewardTokens = merklRewards.rewardTokens;
  }

  return [pool].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.yieldseeker.xyz',
};
