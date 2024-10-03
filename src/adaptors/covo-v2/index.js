const sdk = require('@defillama/sdk');
const utils = require('../utils');
const abi = require('./abis/abi.json');
const { request, gql } = require('graphql-request');
const BigNumber = require('bignumber.js');

const baseUrl = sdk.graph.modifyEndpoint('FLWnk6nG7NDSTJWEh7UE2FBiYpUT6sspurmLzacNkGYr');

const covoaddress = '0x681D3e1b54B3E1a338feB5B076cebf53a697d51F';
const stakingstore = '0x8aBeAA1578024B85084A09Ca2fa46f0a0dfE9c0F';
const poolstore = '0x4c3028bdddbf20D2482f34b7E4151337eAAE45B5';
const covorewardsdistributor = '0x5E0Ca4ED0c910c81315D180F334406140C99295C';

const usdcaddress = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

const polygonusdcstakingtracker = '0xED29cB1b164dd7EA1c5065E79a15dA31EC34327B';

const polygoncovostakingtracker = '0x569629f42c79752436dba855ba7eb577a56e478c';

const secondsPerYear = 31536000;

async function getAdjustedAmountusdc(pTarget, pChain, pAbi, pParams = []) {
  const decimals = 10 ** 6;
  let supply = await sdk.api.abi.call({
    target: pTarget,
    abi: pAbi,
    chain: pChain,
    params: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  });
  return supply.output;
}

async function getAdjustedAmountcovo(pTarget, pChain, pAbi, pParams = []) {
  let decimals = 10 ** 18;
  let supply = await sdk.api.abi.call({
    target: pTarget,
    abi: pAbi,
    chain: pChain,
    params: pParams,
  });

  return pAbi == abi['tokensPerInterval'] ? supply.output : supply.output;
}

async function getPoolCovo(
  pChain,
  pInflationTrackerAddress,
  pPriceData,
  stakedCovoclaimedUSDC,
  stakedCovoPendingUSDC,
  PolygonStakedCovo,
  RewardsdistributorCovo
) {
  let stakedCovoclaimedUSDC1 = parseFloat(stakedCovoclaimedUSDC);
  let stakedCovoPendingUSDC2 = parseFloat(stakedCovoPendingUSDC);
  let RewardsdistributorCovo1 = new BigNumber(RewardsdistributorCovo);
  let decimal3 = new BigNumber(1000000000000000000);

  const RewardsdistributorCovo2 = parseFloat(
    RewardsdistributorCovo1.dividedBy(decimal3)
  );

  let PolygonStakedCovo1 = new BigNumber(PolygonStakedCovo);

  const PolygonStakedCovo2 = parseFloat(PolygonStakedCovo1.dividedBy(decimal3));

  const totalRewardsInUSDC =
    (stakedCovoclaimedUSDC1 + stakedCovoPendingUSDC2) / 100000;

  const tvlstakedcovo = pPriceData.gmx.usd * PolygonStakedCovo2;

  const apy = calculateApy(totalRewardsInUSDC, tvlstakedcovo);

  const yearlyInflationcovo =
    RewardsdistributorCovo2 * secondsPerYear * pPriceData.gmx.usd;

  const apycovoInflation = (yearlyInflationcovo / tvlstakedcovo) * 100;

  const chainString = pChain === 'avax' ? 'avalanche' : pChain;

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(chainString),
    project: 'covo-v2',
    symbol: utils.formatSymbol('COVO'),
    tvlUsd: tvlstakedcovo,
    apyBase: apy,
    apyReward: apycovoInflation,
    rewardTokens: [usdcaddress, covoaddress],
    underlyingTokens: [covoaddress],
  };
}

function calculateApy(totalRewardsInUSDC, tvlcovo, daysInYear = 365) {
  const currentDateTimestamp = Date.now();
  const V2deploytimestamp = 1680052706000;
  const timeDiffInMilliseconds = currentDateTimestamp - V2deploytimestamp;
  const rewardDays = timeDiffInMilliseconds / (1000 * 60 * 60 * 24);

  const dailyYield = totalRewardsInUSDC / rewardDays;
  const dailyYieldRate = dailyYield / tvlcovo;
  const annualYieldRate = (1 + dailyYieldRate) ** daysInYear - 1;
  return annualYieldRate * 100;
}

async function getPoolUsdc(
  pChain,
  pTvl,
  pInflationTrackerAddress,
  pPriceData,
  stakedCovoclaimedUSDC,
  stakedCovoPendingUSDC,
  PolygonUSDCPoolBalance
) {
  let stakedCovoclaimedUSDC1 = parseFloat(stakedCovoclaimedUSDC);
  let stakedCovoPendingUSDC2 = parseFloat(stakedCovoPendingUSDC);
  let PolygonUSDCPoolBalance2 = parseFloat(PolygonUSDCPoolBalance);

  const totalRewardsInUSDC =
    (stakedCovoclaimedUSDC1 + stakedCovoPendingUSDC2) / 1000000;
  console.log({ totalRewardsInUSDC2: totalRewardsInUSDC });
  const tvlcovo = PolygonUSDCPoolBalance2 / 10 ** 6;
  console.log({ tvlcovo2: tvlcovo });
  const apy = calculateApy(totalRewardsInUSDC, tvlcovo);
  console.log({ apy2: apy });

  return {
    pool: pInflationTrackerAddress,
    chain: utils.formatChain(pChain),
    project: 'covo-v2',
    symbol: utils.formatSymbol('USDC'),
    tvlUsd: tvlcovo,
    apyBase: apy,
    apyReward: 0,
    rewardTokens: (chainString = [usdcaddress]),
    underlyingTokens: [usdcaddress],
  };
}

const getDayTimestamp = () => {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
};

const dayTimestamp = getDayTimestamp();

const query = gql`
  {
    uniswapPrice(id: "0x681D3e1b54B3E1a338feB5B076cebf53a697d51F") {
      token
      value
      timestamp
    }
  }
`;

const getPools = async () => {
  let pools = [];

  const priceData = await utils.getData(
    'https://api.coingecko.com/api/v3/simple/price?ids=gmx%2Cwmatic%2Cavalanche-2&vs_currencies=usd'
  );

  let queryC = query;
  let covographprice = await request(baseUrl, queryC);
  covographprice = new BigNumber(covographprice.uniswapPrice.value);
  let decimal = new BigNumber(1000000000000000000000000000000);

  const covopricedecstring = covographprice.dividedBy(decimal);

  const covoprice = parseFloat(covopricedecstring.toString());

  priceData.gmx.usd = covoprice;

  const PolygonUSDCPoolBalance = await getAdjustedAmountusdc(
    poolstore,
    'polygon',
    abi['getBalance']
  );

  const PolygonStakedCovo = await getAdjustedAmountcovo(
    stakingstore,
    'polygon',
    abi['getTotalSupply']
  );

  const stakedCovoclaimedUSDC = await getAdjustedAmountusdc(
    stakingstore,
    'polygon',
    abi['getRewardPerTokenSum']
  );

  const stakedCovoPendingUSDC = await getAdjustedAmountusdc(
    stakingstore,
    'polygon',
    abi['getPendingReward']
  );

  const RewardsdistributorCovo = await getAdjustedAmountcovo(
    covorewardsdistributor,
    'polygon',
    abi['tokensPerInterval']
  );

  pools.push(
    await getPoolCovo(
      'polygon',
      polygoncovostakingtracker,
      priceData,
      stakedCovoclaimedUSDC,
      stakedCovoPendingUSDC,
      PolygonStakedCovo,
      RewardsdistributorCovo
    )
  );

  pools.push(
    await getPoolUsdc(
      'polygon',
      PolygonUSDCPoolBalance,
      polygonusdcstakingtracker,
      priceData,
      stakedCovoclaimedUSDC,
      stakedCovoPendingUSDC,
      PolygonUSDCPoolBalance
    )
  );
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getPools,
  url: 'https://app.covo.finance/pool',
};
