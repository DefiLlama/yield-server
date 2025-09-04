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
    994873017: 'Lumia',
  },
  aptos: {
    1: 'Aptos',
  },
};

interface Erc20Token {
  symbol: string;
}

interface AmmPool {
  tokens: string[];
  usdTvl: number;
}

interface LiquityV2Collateral {
  usdTvl: number;
  mintedDebt: number;
  stabilityPoolDebt: number;
}
interface AaveV3Collateral {
  usdSupply: number;
  usdDebt: number;
}

interface BaseTarget {
  chainType: string;
  chainId: number;
}

interface AmmPoolLiquidityTarget extends BaseTarget {
  type: 'amm-pool-liquidity';
  poolId: string;
}

interface BaseLiquityV2Target extends BaseTarget {
  brand: string;
  collateral: string;
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
  collateral: string;
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

interface TokenDistributable {
  token: string;
}

interface TokenDistributables {
  type: 'tokens';
  list: TokenDistributable[];
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
  distributables: TokenDistributables;
  apr?: number;
}

interface CampaignsResponse {
  resolvedTokens: ByChainTypeAndId<Record<string, Erc20Token>>;
  resolvedPricedTokens: ByChainTypeAndId<Record<string, Erc20Token>>;
  resolvedAmmPools: ByChainTypeAndId<Record<string, AmmPool>>;
  resolvedLiquityV2Collaterals: ByChainTypeAndId<
    Record<string, Record<string, LiquityV2Collateral>>
  >;
  resolvedAaveV3Collaterals: ByChainTypeAndId<
    Record<string, Record<string, Record<string, AaveV3Collateral>>>
  >;
  campaigns: Campaign[];
}

module.exports = {
  timetravel: false,
  apy: async () => {
    const response = (await getData(
      'https://api.metrom.xyz/v2/campaigns?status=active'
    )) as CampaignsResponse;

    const campaigns = [];
    for (const campaign of response.campaigns) {
      const chainType = campaign.chainType;
      const byType = CHAIN_TYPE_AND_NAMES[chainType];
      if (!byType) continue;

      const chainId = campaign.chainId;
      const chain = byType[chainId];

      if (
        !chain ||
        campaign.distributables.type !== 'tokens' ||
        chainId !== campaign.target.chainId ||
        !campaign.apr
      )
        continue;

      let processedCampaign;
      try {
        processedCampaign = processCampaign(response, campaign);
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
        rewardTokens: campaign.distributables.list.map(
          (reward) => reward.token
        ),
        url: `https://app.metrom.xyz/en/campaigns/${chainType}/${chainId}/${campaign.id}`,
      });
    }

    return campaigns.filter(keepFinite);
  },
};

function getByChainTypeAndId<I extends object>(
  map: ByChainTypeAndId<I>,
  chainType: string,
  chainId: number
): I {
  const byChainType = map[chainType];
  if (!byChainType) return {} as I;
  return byChainType[chainId];
}

interface ProcessedCampaign {
  symbol: string;
  tvlUsd: number;
  underlyingTokens: string[];
}

function processCampaign(
  response: CampaignsResponse,
  campaign: Campaign
): ProcessedCampaign | null {
  switch (campaign.target.type) {
    case 'amm-pool-liquidity': {
      return processAmmPoolLiquidityCampaign(
        response,
        campaign,
        campaign.target.poolId
      );
    }
    case 'liquity-v2-debt': {
      return processLiquityV2Campaign(
        response,
        campaign,
        campaign.target.brand,
        campaign.target.collateral,
        true
      );
    }
    case 'liquity-v2-stability-pool': {
      return processLiquityV2Campaign(
        response,
        campaign,
        campaign.target.brand,
        campaign.target.collateral,
        false
      );
    }
    case 'gmx-v1-liquidity': {
      // FIXME: for now, with the current API, it's impossible to process GMX v1
      // campaigns, address this later on
      return null;
    }
    case 'aave-v3-supply': {
      return processAaveV3Campaign(
        response,
        campaign,
        campaign.target.brand,
        campaign.target.market,
        campaign.target.collateral,
        'supply'
      );
    }
    case 'aave-v3-borrow': {
      return processAaveV3Campaign(
        response,
        campaign,
        campaign.target.brand,
        campaign.target.market,
        campaign.target.collateral,
        'borrow'
      );
    }
    case 'aave-v3-net-supply': {
      return processAaveV3Campaign(
        response,
        campaign,
        campaign.target.brand,
        campaign.target.market,
        campaign.target.collateral,
        'net-supply'
      );
    }
    default: {
      return null;
    }
  }
}

function processAmmPoolLiquidityCampaign(
  response: CampaignsResponse,
  campaign: Campaign,
  poolId: string
): ProcessedCampaign | null {
  const resolvedTokens = getByChainTypeAndId(
    response.resolvedTokens,
    campaign.target.chainType,
    campaign.target.chainId
  );

  const resolvedPools = getByChainTypeAndId(
    response.resolvedAmmPools,
    campaign.target.chainType,
    campaign.target.chainId
  );

  const resolvedPool = resolvedPools[poolId];

  const poolTokenSymbols = [];
  for (const token of resolvedPool.tokens) {
    const resolvedToken = resolvedTokens[token];
    if (!resolvedToken) return null;
    poolTokenSymbols.push(resolvedToken.symbol);
  }

  return {
    symbol: formatSymbol(poolTokenSymbols.join(' - ')),
    tvlUsd: resolvedPool.usdTvl,
    underlyingTokens: resolvedPool.tokens,
  };
}

function processLiquityV2Campaign(
  response: CampaignsResponse,
  campaign: Campaign,
  brand: string,
  collateralAddress: string,
  debt: boolean
): ProcessedCampaign | null {
  const resolvedPricedTokens = getByChainTypeAndId(
    response.resolvedPricedTokens,
    campaign.target.chainType,
    campaign.target.chainId
  );

  const collateralToken = resolvedPricedTokens[collateralAddress];
  if (!collateralToken) return null;

  const resolvedCollaterals = getByChainTypeAndId(
    response.resolvedLiquityV2Collaterals,
    campaign.target.chainType,
    campaign.target.chainId
  );
  const resolvedCollateralsByBrand = resolvedCollaterals[brand];
  if (!resolvedCollateralsByBrand) return null;
  const collateral = resolvedCollateralsByBrand[collateralAddress];
  if (!collateral) return null;

  return {
    symbol: formatSymbol(collateralToken.symbol),
    tvlUsd: debt ? collateral.mintedDebt : collateral.stabilityPoolDebt,
    underlyingTokens: [collateralToken.symbol],
  };
}

function processAaveV3Campaign(
  response: CampaignsResponse,
  campaign: Campaign,
  brand: string,
  market: string,
  collateralAddress: string,
  action: 'supply' | 'borrow' | 'net-supply'
): ProcessedCampaign | null {
  const resolvedTokens = getByChainTypeAndId(
    response.resolvedTokens,
    campaign.target.chainType,
    campaign.target.chainId
  );

  const collateralToken = resolvedTokens[collateralAddress];
  if (!collateralToken) return null;

  const resolvedCollaterals = getByChainTypeAndId(
    response.resolvedAaveV3Collaterals,
    campaign.target.chainType,
    campaign.target.chainId
  );
  const resolvedCollateralsByBrand = resolvedCollaterals[brand];
  if (!resolvedCollateralsByBrand) return null;
  const resolvedCollateralsByMarket = resolvedCollateralsByBrand[market];
  if (!resolvedCollateralsByMarket) return null;
  const collateral = resolvedCollateralsByMarket[collateralAddress];
  if (!collateral) return null;

  let tvlUsd;
  switch (action) {
    case 'supply': {
      tvlUsd = collateral.usdSupply;
      break;
    }
    case 'borrow': {
      tvlUsd = collateral.usdDebt;
      break;
    }
    case 'net-supply': {
      tvlUsd = Math.max(collateral.usdSupply - collateral.usdDebt, 0);
      break;
    }
  }

  return {
    symbol: formatSymbol(collateralToken.symbol),
    tvlUsd,
    underlyingTokens: [collateralToken.symbol],
  };
}
