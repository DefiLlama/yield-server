const { getData, formatChain, formatSymbol, keepFinite } = require('../utils');

const PROJECT = 'metrom';

const CHAIN_NAMES: Record<number, string> = {
  8_453: 'Base',
  34_443: 'Mode',
  5_000: 'Mantle',
  167_000: 'Taiko',
};

interface Erc20Token {
  address: string;
  decimals: number;
  symbol: string;
}

interface Pool {
  address: string;
  tokens: Erc20Token[];
  usdTvl: number;
}

interface Reward extends Erc20Token {
  amount: string;
}

interface Campaign {
  chainId: number;
  id: string;
  pool: Pool;
  rewards: Reward[];
  apr: number | null;
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const rawCampaigns = (await getData(
      'https://api.metrom.xyz/v1/campaigns?status=active'
    )) as Campaign[];

    const campaigns = [];
    for (const rawCampaign of rawCampaigns) {
      const chainId = rawCampaign.chainId;
      const chain = CHAIN_NAMES[chainId];
      if (!chain) {
        console.warn(`No chain with id ${rawCampaign.chainId}`);
        continue;
      }

      const apr = rawCampaign.apr;
      if (!apr) {
        console.warn(
          `No APR for campaign with id ${rawCampaign.id} on chain ${chainId}`
        );
        continue;
      }

      campaigns.push({
        pool: rawCampaign.pool.address,
        chain: formatChain(chain),
        project: PROJECT,
        symbol: formatSymbol(
          rawCampaign.pool.tokens.map((token) => token.symbol).join(' - ')
        ),
        tvlUsd: rawCampaign.pool.usdTvl,
        apyReward: apr,
        rewardTokens: rawCampaign.rewards.map((reward) => reward.address),
        underlyingTokens: rawCampaign.pool.tokens.map((token) => token.address),
        url: `https://app.metrom.xyz/campaigns/${chainId}/${rawCampaign.id}`,
      });
    }

    return campaigns.filter(keepFinite);
  },
};
