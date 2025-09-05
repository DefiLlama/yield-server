const fetch = require('node-fetch');

function isLeapYear(year) {
  return (year % 4 == 0 && year % 100 != 0) || year % 400 == 0;
}

async function getDistributions(endpoint = 'evaa.space') {
  try {
    let result = await fetch(`https://${endpoint}/query/distributions/list`, {
      headers: { accept: 'application/json' },
    });
    let resData = await result.json();
    return resData;
  } catch (error) {
    console.error(error);
    return undefined;
  }
}
const isLeap = isLeapYear(new Date().getFullYear());
const totalSecsInYear = (isLeap ? 366 : 365) * 24 * 60 * 60;
const SCALE_FACTOR = BigInt(1e12);

function calcApy(
  rewardAmount,
  totalAmount,
  rewardingAssetPrice,
  rewardsAssetPrice,
  rewardingScaleFactor,
  rewardsScaleFactor,
  totalSecsInCurrentSeason
) {
  const totalValueLockedUsd =
    (Number(totalAmount) / rewardingScaleFactor) * (rewardingAssetPrice || 0);

  if (!totalValueLockedUsd) {
    return 0;
  }

  const rewardAmountUsd =
    (Number(rewardAmount) / rewardsScaleFactor) * (rewardsAssetPrice || 0);

  const rewardsPerSecUsd = rewardAmountUsd / totalSecsInCurrentSeason;
  return (rewardsPerSecUsd / totalValueLockedUsd) * totalSecsInYear * 100;
}

function calculateRewardApy(distributionsResp, pool, data, prices) {
  try {
    if (
      !distributionsResp?.distributions ||
      distributionsResp.distributions.length === 0
    ) {
      console.log('Invalid distributions data:', distributionsResp);
      return [];
    }

    const activeCampaigns = distributionsResp.distributions.filter(
      (campaign) => campaign.started && !campaign.expired
    );
    if (!activeCampaigns.length) {
      return [];
    }

    const activeSeasons = activeCampaigns
      .flatMap((campaign) => campaign.seasons || [])
      .filter(
        (season) => season.started && !season.expired && season.pool === pool
      );

    if (!activeSeasons.length) {
      return [];
    }

    const seasonsApy = activeSeasons.map((season) => {
      const rewardingAssetId = BigInt(season?.rewarding_asset_id ?? 0);
      const rewardsAssetId = BigInt(season?.rewards_asset_id ?? 0);

      const rewardingAssetData = data.assetsData.get(rewardingAssetId);
      const rewardsAssetData = data.assetsData.get(rewardsAssetId);

      if (!rewardingAssetData || !rewardsAssetData) {
        return [];
      }

      const rewardType = season?.reward_type?.toLowerCase();

      let rewardAmount = Number(season?.rewards_amount) || 0;

      if (rewardType === 'borrow' && season?.borrow_budget) {
        rewardAmount = season.borrow_budget;
      } else if (rewardType === 'supply' && season?.supply_budget) {
        rewardAmount = season.supply_budget;
      }

      const totalAmountSupply =
        (rewardingAssetData.totalSupply * rewardingAssetData.sRate) /
        SCALE_FACTOR;
      const totalAmountBorrow =
        (rewardingAssetData.totalBorrow * rewardingAssetData.bRate) /
        SCALE_FACTOR;

      const totalAmount =
        rewardType === 'borrow' ? totalAmountBorrow : totalAmountSupply;

      if (!totalAmount || totalAmount === '0') {
        return [];
      }

      const rewardingAssetConfig = data.assetsConfig.get(rewardingAssetId);
      const rewardsAssetConfig = data.assetsConfig.get(rewardsAssetId);

      const rewardingScaleFactor =
        10 ** Number(rewardingAssetConfig?.decimals ?? 0);
      const rewardsScaleFactor =
        10 ** Number(rewardsAssetConfig?.decimals ?? 0);

      const rewardingPriceData = prices.dict.get(rewardingAssetId);
      const rewardsPriceData = prices.dict.get(rewardsAssetId);

      const rewardingAssetPrice = Number(rewardingPriceData);
      const rewardsAssetPrice = Number(rewardsPriceData);

      const seasonStart = new Date(season?.campaign_start ?? 0);
      const seasonEnd = new Date(season?.campaign_end ?? 0);
      const totalSecsInCurrentSeason = (seasonEnd - seasonStart) / 1000;

      if (totalSecsInCurrentSeason <= 0) {
        return [];
      }

      const baseApy = calcApy(
        rewardAmount,
        totalAmount,
        rewardingAssetPrice,
        rewardsAssetPrice,
        rewardingScaleFactor,
        rewardsScaleFactor,
        totalSecsInCurrentSeason
      );

      const result = [
        {
          apy: baseApy,
          rewardType,
          rewardingAssetId,
          rewardsAssetId,
        },
      ];

      if (
        rewardType === 'borrow' &&
        season?.supply_budget &&
        season.supply_budget > 0
      ) {
        const supplyApy = calcApy(
          season.supply_budget,
          totalAmountSupply,
          rewardingAssetPrice,
          rewardsAssetPrice,
          rewardingScaleFactor,
          rewardsScaleFactor,
          totalSecsInCurrentSeason
        );
        result.push({
          apy: supplyApy,
          rewardType: 'supply',
          rewardingAssetId,
          rewardsAssetId,
        });
      } else if (
        rewardType === 'supply' &&
        season?.borrow_budget &&
        season.borrow_budget > 0
      ) {
        const borrowApy = calcApy(
          season.borrow_budget,
          totalAmountBorrow,
          rewardingAssetPrice,
          rewardsAssetPrice,
          rewardingScaleFactor,
          rewardsScaleFactor,
          totalSecsInCurrentSeason
        );
        result.push({
          apy: borrowApy,
          rewardType: 'borrow',
          rewardingAssetId,
          rewardsAssetId,
        });
      }

      return result;
    });

    return seasonsApy.flat();
  } catch (error) {
    console.error(error);
    return [];
  }
}

module.exports = {
  getDistributions,
  calculateRewardApy,
};
