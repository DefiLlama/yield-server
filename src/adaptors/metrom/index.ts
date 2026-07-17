const { getData, formatChain, keepFinite } = require('../utils');

const PROJECT = 'metrom';
const METROM_REWARDS_URL = 'https://app.metrom.xyz/en?type=rewards';
const TURTLE_OPPORTUNITY_URL =
  'https://gateway.turtle.xyz/turtle/opportunities';
const BASE_USDC = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';

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
    42_161: 'Arbitrum',
    9_745: 'Plasma',
    5_464: 'Saga',
    747_474: 'Katana',
    4_326: 'MegaETH',
    1: 'Ethereum',
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
  url?: string;
}

interface AmmPoolLiquidityTarget extends BaseTarget {
  type: 'amm-pool-liquidity';
  id: string;
  dex: string;
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

interface Incentive {
  name: string;
  apr?: number;
  yield?: number;
  rewardTypeName?: string;
}

interface TurtleTarget extends BaseTarget {
  type: 'turtle';
  opportunityId: string;
  name: string;
  incentives?: Incentive[];
}

interface YieldSeekerTarget extends BaseTarget {
  type: 'yield-seeker';
}

interface Erc4626Target extends BaseTarget {
  type: 'erc4626-vault';
  brand: string;
  vault: {
    name: string;
    symbol: string;
    asset: string;
  };
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
    | AaveV3NetSupplyTarget
    | TurtleTarget
    | YieldSeekerTarget
    | Erc4626Target;
  rewards?: Rewards;
  usdTvl?: number;
  apr?: number;
}

interface CampaignsResponse {
  totalItems: number;
  campaigns: Campaign[];
}

interface TurtleOpportunity {
  slug: string;
  name: string;
  url?: string;
  baseTokens?: Token;
  depositTokens?: Token[];
  incentives?: Incentive[];
}

module.exports = {
  protocolId: '5214',
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
          !Number.isFinite(campaign.apr) ||
          !campaign.usdTvl
        )
          continue;

        let processedCampaign;
        try {
          processedCampaign = await processCampaign(campaign);
        } catch (err) {
          console.error(
            `Could not process campaign with id ${campaign.id}: ${err}`
          );
          continue;
        }

        if (!processedCampaign) continue;

        campaigns.push({
          ...processedCampaign,
          pool: campaign.id.toLowerCase(),
          chain: formatChain(chain),
          project: PROJECT,
          tvlUsd: campaign.usdTvl,
          ...getCampaignApyFields(campaign, processedCampaign),
          url:
            processedCampaign.url || campaign.target.url || METROM_REWARDS_URL,
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
  url?: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  rewardTokens?: string[];
  poolMeta: string;
}

async function processCampaign(
  campaign: Campaign
): Promise<ProcessedCampaign | null> {
  switch (campaign.target.type) {
    case 'amm-pool-liquidity': {
      return {
        symbol: campaign.target.tokens.map((token) => token.symbol).join(' - '),
        underlyingTokens: campaign.target.tokens.map((token) => token.address),
        poolMeta: humanizeTargetProtocol('Pool on', campaign.target.dex),
      };
    }
    case 'liquity-v2-debt': {
      return {
        symbol: campaign.target.collateral.symbol,
        underlyingTokens: [campaign.target.collateral.address],
        poolMeta: humanizeTargetProtocol('Borrow on', campaign.target.brand),
      };
    }
    case 'liquity-v2-stability-pool': {
      return {
        symbol: campaign.target.collateral.symbol,
        underlyingTokens: [campaign.target.collateral.address],
        poolMeta: humanizeTargetProtocol(
          'Stability pool on',
          campaign.target.brand
        ),
      };
    }
    case 'gmx-v1-liquidity': {
      // FIXME: for now, with the current API, it's impossible to process GMX v1
      // campaigns, address this later on
      return null;
    }
    case 'aave-v3-supply': {
      return {
        symbol: campaign.target.collateral.symbol,
        underlyingTokens: [campaign.target.collateral.address],
        poolMeta: humanizeTargetProtocol('Lend on', campaign.target.brand),
      };
    }
    case 'aave-v3-borrow': {
      return {
        symbol: campaign.target.collateral.symbol,
        underlyingTokens: [campaign.target.collateral.address],
        poolMeta: humanizeTargetProtocol('Borrow on', campaign.target.brand),
      };
    }
    case 'aave-v3-net-supply': {
      return {
        symbol: campaign.target.collateral.symbol,
        underlyingTokens: [campaign.target.collateral.address],
        poolMeta: humanizeTargetProtocol('Net lend on', campaign.target.brand),
      };
    }
    case 'turtle': {
      const opportunity = await getTurtleOpportunity(
        campaign.target.opportunityId
      );
      const incentives =
        opportunity?.incentives || campaign.target.incentives || [];

      return {
        symbol: (opportunity?.name || campaign.target.name).replace(
          /^Katana\s+/i,
          ''
        ),
        underlyingTokens: getTurtleUnderlyingTokens(opportunity),
        url: opportunity?.url,
        ...getTurtleApyFields(incentives, campaign.apr),
        poolMeta: humanizeTargetProtocol('Deposit to', campaign.target.name),
      };
    }
    case 'yield-seeker': {
      return {
        symbol: 'USDC',
        underlyingTokens: [BASE_USDC],
        poolMeta: 'Deposit',
      };
    }
    case 'erc4626-vault': {
      return {
        symbol: campaign.target.vault.symbol,
        underlyingTokens: [campaign.target.vault.asset],
        poolMeta: humanizeTargetProtocol(
          'Deposit to',
          campaign.target.vault.name
        ),
      };
    }
    default: {
      return null;
    }
  }
}

async function getTurtleOpportunity(
  opportunityId: string
): Promise<TurtleOpportunity | null> {
  if (!opportunityId) return null;

  try {
    return (await getData(
      `${TURTLE_OPPORTUNITY_URL}/${opportunityId}`
    )) as TurtleOpportunity;
  } catch (err) {
    console.error(
      `Could not fetch Turtle opportunity with id ${opportunityId}: ${err}`
    );
    return null;
  }
}

function getTurtleUnderlyingTokens(opportunity?: TurtleOpportunity | null) {
  const token = opportunity?.baseTokens || opportunity?.depositTokens?.[0];
  if (!token?.address) return [];

  return [token.address.toLowerCase()];
}

function getTurtleApyFields(incentives: Incentive[], totalApy?: number) {
  const baseIncentives = incentives.filter(isBaseYieldIncentive);
  const rewardIncentives = incentives.filter(
    (incentive) => !isBaseYieldIncentive(incentive)
  );
  const apyBase = sumIncentives(baseIncentives);
  const apyReward = sumIncentives(rewardIncentives);

  if (!apyBase && !apyReward) return { apy: totalApy };

  return {
    ...(apyBase ? { apyBase } : {}),
    ...(apyReward
      ? {
          apyReward,
          rewardTokens: Array.from(
            new Set(rewardIncentives.map(getRewardToken).filter(Boolean))
          ),
        }
      : {}),
  };
}

function isBaseYieldIncentive(incentive: Incentive) {
  return ['native yield', 'lending yield'].includes(
    incentive.name.toLowerCase()
  );
}

function sumIncentives(incentives: Incentive[]) {
  return incentives.reduce((sum, incentive) => {
    const apy = incentive.apr ?? incentive.yield ?? 0;
    return Number.isFinite(apy) ? sum + apy : sum;
  }, 0);
}

function getRewardToken(incentive: Incentive) {
  if (incentive.rewardTypeName) return incentive.rewardTypeName;

  const token = incentive.name.match(/^[A-Z0-9]+/)?.[0];
  return token || incentive.name;
}

function getCampaignApyFields(
  campaign: Campaign,
  processedCampaign: ProcessedCampaign
) {
  if (
    Number.isFinite(processedCampaign.apy) ||
    Number.isFinite(processedCampaign.apyBase) ||
    Number.isFinite(processedCampaign.apyReward)
  )
    return {};

  const rewards = campaign.rewards?.assets || [];
  return rewards.length
    ? {
        apyReward: campaign.apr,
        rewardTokens: rewards.map((reward) => reward.address),
      }
    : { apy: campaign.apr };
}

function humanizeTargetProtocol(action: string, protocolSlug?: string): string {
  const normalizedSlug = protocolSlug?.trim();
  if (!normalizedSlug) return action;

  return `${action} ${normalizedSlug
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')}`;
}
