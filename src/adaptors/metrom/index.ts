const { getData, formatChain, formatSymbol, keepFinite } = require('../utils');

const PROJECT = 'metrom';

type ByChainTypeAndId<I> = Record<string, Record<number, I>>;

const CHAIN_TYPE_AND_NAMES: ByChainTypeAndId<string> = {
  evm: {
    8_453: 'Base',
    167_000: 'Taiko',
    534_352: 'Scroll',
    146: 'Sonic',
    478: 'Form',
    100: 'Gnosis',
    40: 'Telos',
    1_890: 'LightLink',
    1_329: 'Sei',
    1_923: 'Swell',
    43_111: 'Hemi',
    232: 'Lens',
    994_873_017: 'Lumia',
  },
  aptos: {
    1: 'Aptos',
  },
};

const PAGE_SIZE = 20;

interface Token {
  address: string;
  symbol: string;
}

interface BaseTarget {
  chainType: string;
  chainId: number;
}

interface AmmPoolLiquidityTarget extends BaseTarget {
  type: 'amm-pool-liquidity';
  id: string;
  tokens: Token[];
  usdTvl: number;
}

interface BaseLiquityV2Target extends BaseTarget {
  brand: string;
  collateral: Token;
}

interface LiquityV2DebtTarget extends BaseLiquityV2Target {
  type: 'liquity-v2-debt';
}

interface LiquityV2StabilityPoolTarget extends BaseLiquityV2Target {
  type: 'liquity-v2-stability-pool';
}

interface GmxV1LiquidityTarget extends BaseTarget {
  type: 'gmx-v1-liquidity';
  brand: string;
}

interface BaseAaveV3Target extends BaseTarget {
  brand: string;
  market: string;
  collateral: Token;
}

interface AaveV3SupplyTarget extends BaseAaveV3Target {
  type: 'aave-v3-supply';
}

interface AaveV3BorrowTarget extends BaseAaveV3Target {
  type: 'aave-v3-borrow';
}

interface AaveV3NetSupplyTarget extends BaseAaveV3Target {
  type: 'aave-v3-net-supply';
}

interface Reward extends Token {
  amount: string;
  remaining: string;
}

interface Rewards {
  assets: Reward[];
}

interface Campaign {
  chainType: string;
  chainId: number;
  id: string;
  target:
    | AmmPoolLiquidityTarget
    | LiquityV2DebtTarget
    | LiquityV2StabilityPoolTarget
    | GmxV1LiquidityTarget
    | AaveV3SupplyTarget
    | AaveV3BorrowTarget
    | AaveV3NetSupplyTarget;
  rewards: Rewards;
  usdTvl?: number;
  apr?: number;
}

interface CampaignsResponse {
  totalItems: number;
  campaigns: Campaign[];
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const campaigns = [];

    let page = 1;
    while (true) {
      const response = (await getData(
        `https://api.metrom.xyz/v2/campaigns/rewards?page=${page}&pageSize=${PAGE_SIZE}&statuses=active`
      )) as CampaignsResponse;

      for (const campaign of response.campaigns) {
        const chainType = campaign.chainType;
        const byType = CHAIN_TYPE_AND_NAMES[chainType];
        if (!byType) continue;

        const chainId = campaign.chainId;
        const chain = byType[chainId];

        if (
          !chain ||
          chainId !== campaign.target.chainId ||
          !campaign.apr ||
          !campaign.usdTvl
        )
          continue;

        let processedCampaign;
        try {
          processedCampaign = processCampaign(campaign);
        } catch (err) {
          console.error(
            `Could not process campaign with id ${campaign.id}: ${err}`
          );
          continue;
        }

        campaigns.push({
          ...processedCampaign,
          pool: campaign.id.toLowerCase(),
          chain: formatChain(chain),
          project: PROJECT,
          apyReward: campaign.apr,
          tvlUsd: campaign.usdTvl,
          rewardTokens: campaign.rewards.assets.map((reward) => reward.address),
          url: `https://app.metrom.xyz/en/campaigns/${chainType}/${chainId}/${campaign.id}`,
        });
      }

      if (response.campaigns.length < PAGE_SIZE) break;

      page++;
    }

    return campaigns.filter(keepFinite);
  },
};

interface ProcessedCampaign {
  symbol: string;
  underlyingTokens: string[];
}

function processCampaign(campaign: Campaign): ProcessedCampaign | null {
  switch (campaign.target.type) {
    case 'amm-pool-liquidity': {
      return {
        symbol: formatSymbol(
          campaign.target.tokens.map((token) => token.symbol).join(' - ')
        ),
        underlyingTokens: campaign.target.tokens.map((token) => token.address),
      };
    }
    case 'liquity-v2-debt':
    case 'liquity-v2-stability-pool': {
      return {
        symbol: formatSymbol(campaign.target.collateral.symbol),
        underlyingTokens: [campaign.target.collateral.symbol],
      };
    }
    case 'gmx-v1-liquidity': {
      // FIXME: for now, with the current API, it's impossible to process GMX v1
      // campaigns, address this later on
      return null;
    }
    case 'aave-v3-supply':
    case 'aave-v3-borrow':
    case 'aave-v3-net-supply': {
      return {
        symbol: formatSymbol(campaign.target.collateral.symbol),
        underlyingTokens: [campaign.target.collateral.symbol],
      };
    }
    default: {
      return null;
    }
  }
}
