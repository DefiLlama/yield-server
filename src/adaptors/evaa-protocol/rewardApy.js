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

function calcApy(
  rewardAmount,
  totalAmount,
  rewardingAssetPrice,
  rewardsAssetPrice,
  rewardingScaleFactor,
  rewardsScaleFactor,
  totalSecsInCurrentSeason
) {
  const rate = rewardingScaleFactor / Number(totalAmount);
  const rewardForUnit =
    rate *
    (((Number(rewardAmount) / rewardsScaleFactor) * (rewardsAssetPrice ?? 0)) /
      (rewardingAssetPrice || 1)) *
    rewardingScaleFactor;

  return (
    ((rewardForUnit * totalSecsInYear) /
      (totalSecsInCurrentSeason * rewardingScaleFactor)) *
    100
  );
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

    const currentCampaign = distributionsResp?.distributions.find(
      (campaign) => campaign.started && !campaign.expired
    );

    if (!currentCampaign) {
      return [];
    }

    const seasonsApy = currentCampaign.seasons
      ?.filter((season) => season.started && !season.expired)
      ?.filter((season) => season.pool === pool)
      ?.map((season) => {
        const rewardingAssetId = BigInt(season?.rewarding_asset_id ?? 0);
        const rewardsAssetId = BigInt(season?.rewards_asset_id ?? 0);

        const rewardingAssetData = data.assetsData.get(rewardingAssetId);
        const rewardsAssetData = data.assetsData.get(rewardsAssetId);

        if (!rewardingAssetData || !rewardsAssetData) {
          return [];
        }

        const rewardType =
          season?.reward_type?.toLowerCase() === 'borrow' ? 'Borrow' : 'Supply';

        let rewardAmount = Number(season?.rewards_amount) || 0;

        if (rewardType === 'Borrow' && season?.borrow_budget) {
          rewardAmount = season.borrow_budget;
        } else if (rewardType === 'Supply' && season?.supply_budget) {
          rewardAmount = season.supply_budget;
        }

        const totalAmountSupply =
          rewardingAssetData.totalSupply?.original ??
          rewardingAssetData.totalSupply;
        const totalAmountBorrow =
          rewardingAssetData.totalBorrow?.original ??
          rewardingAssetData.totalBorrow;

        const totalAmount =
          rewardType === 'Borrow' ? totalAmountBorrow : totalAmountSupply;

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
          rewardType === 'Borrow' &&
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
            rewardType: 'Supply',
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
