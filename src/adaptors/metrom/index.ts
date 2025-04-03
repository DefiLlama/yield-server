const { getData, formatChain, formatSymbol, keepFinite } = require('../utils');

const PROJECT = 'metrom';

const CHAIN_NAMES: Record<number, string> = {
  34_443: 'Mode',
  5_000: 'Mantle',
  8_453: 'Base',
  167_000: 'Taiko',
  534_352: 'Scroll',
  146: 'Sonic',
  478: 'Form',
  100: 'Gnosis',
  1890: 'LightLink',
};

interface Erc20Token {
  symbol: string;
}

interface AmmPool {
  tokens: string[];
  usdTvl: number;
}

interface AmmPoolLiquidityTarget {
  type: 'amm-pool-liquidity';
  chainId: number;
  poolAddress: string;
}

interface TokenDistributable {
  token: string;
}

interface TokenDistributables {
  type: 'tokens';
  list: TokenDistributable[];
}

interface Campaign {
  chainId: number;
  id: string;
  target: AmmPoolLiquidityTarget;
  distributables: TokenDistributables;
  apr?: number;
}

interface CampaignsResponse {
  resolvedTokens: Record<number, Record<string, Erc20Token>>;
  resolvedAmmPools: Record<number, Record<string, AmmPool>>;
  campaigns: Campaign[];
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const response = (await getData(
      'https://api.metrom.xyz/v1/campaigns?status=active'
    )) as CampaignsResponse;

    const campaigns = [];
    outer: for (const campaign of response.campaigns) {
      const chainId = campaign.chainId;
      const chain = CHAIN_NAMES[chainId];
      if (
        !chain ||
        campaign.distributables.type !== 'tokens' ||
        campaign.target.type !== 'amm-pool-liquidity' ||
        chainId !== campaign.target.chainId ||
        !campaign.apr
      )
        continue;

      const resolvedTokensByChain =
        response.resolvedTokens[campaign.target.chainId];
      if (!resolvedTokensByChain) continue;

      const resolvedPoolsByChain =
        response.resolvedAmmPools[campaign.target.chainId];
      if (!resolvedPoolsByChain) continue;

      const resolvedPool = resolvedPoolsByChain[campaign.target.poolAddress];
      if (!resolvedPool) continue;

      const poolTokenSymbols = [];
      for (const token of resolvedPool.tokens) {
        const resolvedToken = resolvedTokensByChain[token];
        if (!resolvedToken) continue outer;
        poolTokenSymbols.push(resolvedToken.symbol);
      }

      campaigns.push({
        pool: campaign.id.toLowerCase(),
        chain: formatChain(chain),
        project: PROJECT,
        symbol: formatSymbol(poolTokenSymbols.join(' - ')),
        tvlUsd: resolvedPool.usdTvl,
        apyReward: campaign.apr,
        rewardTokens: campaign.distributables.list.map(
          (reward) => reward.token
        ),
        underlyingTokens: resolvedPool.tokens,
        url: `https://app.metrom.xyz/en/campaigns/${chainId}/${campaign.id}`,
      });
    }

    return campaigns.filter(keepFinite);
  },
};
