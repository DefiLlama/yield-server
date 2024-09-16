const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { BigNumber } = require('ethers');
const { AddressZero } = require('@ethersproject/constants');

const abi = require('./abi.json');
const config = require('./config.json');

const BLOCKS_PER_YEAR = 8e6;

const MONTHS_IN_YEAR = 12;
const DAYS_IN_YEAR = 365;
const NUMBER_OF_PERIODS = DAYS_IN_YEAR;

const ONE = (decimals) => BigNumber.from(10).pow(decimals);
const TRANSFORM_TO_PERCENTS = (num) => num * 100;

function formatBigNumber(num, decimals) {
  if (num.length > decimals) {
    return (
      num.slice(0, num.length - decimals) +
      '.' +
      num.slice(num.length - decimals)
    );
  } else {
    return '0.' + '0'.repeat(decimals - num.length) + num;
  }
}

async function getFees(chain, portfolios) {
  const res = {};

  const fees = (
    await utils.getData(`${config.apiUrl[chain]}/portfolio/fee`, {
      portfolio: portfolios,
      period: 30,
    })
  ).fee;

  for (let i = 0; i < fees.length; ++i) {
    res[portfolios[i]] = fees[i];
  }

  return res;
}

async function getTokenVsUsdPrice(token) {
  const priceKey = `coingecko:${token}`;
  const { coins: bluesPrice } = await utils.getData(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );

  const [i, f] = bluesPrice[priceKey].price.toString().split('.');

  if (f === undefined) {
    return BigNumber.from(i + '0'.repeat(6));
  } else {
    return BigNumber.from(
      i + f.slice(0, 6) + '0'.repeat(f.length < 6 ? 6 - f.length : 0)
    );
  }
}

function apy(apr, aprWeights) {
  const apr1 = apr * Number(formatBigNumber(aprWeights[0], 4));
  const apr2 =
    apr *
    (Number(formatBigNumber(aprWeights[1], 4)) +
      Number(formatBigNumber(aprWeights[2], 4)));

  const apy1 = (1 + apr1 / NUMBER_OF_PERIODS) ** NUMBER_OF_PERIODS;

  // console.log("weight1:", Number(formatBigNumber(aprWeights[0], 4)));
  // console.log("weight2:", Number(formatBigNumber(aprWeights[1], 4)));
  // console.log("weight3:", Number(formatBigNumber(aprWeights[2], 4)));
  // console.log("apr1:", apr1);
  // console.log("apr2:", apr2);
  // console.log("apy1:", apy1);

  return apy1 + (apr2 / apr1) * (apy1 - 1) - 1;
}

async function farming(
  chain,
  aprWeights,
  rewardToken,
  BLUES_PRICE,
  portfolios
) {
  const res = [];
  const transform = (addr) => `${chain}:${addr}`;
  const fixBalances = i => i

  const fees = await getFees(chain, portfolios.contractAddress);

  const farms = (
    await sdk.api.abi.call({
      abi: abi.BlueshiftMinter.getFarms,
      chain: chain,
      target: config.minter[chain],
      params: [],
    })
  ).output;

  const farmInfos = (
    await sdk.api.abi.call({
      abi: abi.BlueshiftMinter.getStatusFarms,
      chain: chain,
      target: config.minter[chain],
      params: [
        AddressZero,
        (await sdk.api.util.getLatestBlock(chain)).timestamp,
      ],
    })
  ).output;

  for (let farm of farms) {
    const receivedToken = (
      await sdk.api.abi.call({
        abi: abi.BlueshiftEarning.getToken,
        chain: chain,
        target: farm,
        params: [],
      })
    ).output;

    let indexOfPortfolioWithReceivedToken = undefined;

    for (let i = 0; i < portfolios.lpTokenAddress.length; ++i) {
      if (portfolios.lpTokenAddress[i] === receivedToken) {
        indexOfPortfolioWithReceivedToken = i;
        break;
      }
    }

    if (indexOfPortfolioWithReceivedToken === undefined) {
      continue;
    }

    const farmInfo = farmInfos.filter((farmInfo) => farmInfo.farm === farm)[0];
    if (farmInfo === undefined) {
      continue;
    }

    const tokensAddresses =
      portfolios.tokens[indexOfPortfolioWithReceivedToken].tokenAddress;

    const tokensSymbols = (
      await sdk.api.abi.multiCall({
        abi: abi.ERC20.symbol,
        chain: chain,
        calls: tokensAddresses.map((tokenAddress) => ({
          target: tokenAddress,
          params: [],
        })),
        requery: true,
      })
    ).output.map((s) => s.output);

    const rewardedFee = Number(
      formatBigNumber(
        BigNumber.from(
          fees[portfolios.contractAddress[indexOfPortfolioWithReceivedToken]]
        )
          .mul(MONTHS_IN_YEAR)
          .toString(),
        6
      )
    );
    const rewardedStake = Number(
      formatBigNumber(
        BigNumber.from(farmInfo.rewardPerBlock)
          .mul(BLOCKS_PER_YEAR)
          .mul(BLUES_PRICE)
          .div(ONE(18))
          .toString(),
        6
      )
    );

    let tvl = farmInfo.accDeposited;
    tvl = BigNumber.from(tvl)
      .mul(
        BigNumber.from(
          portfolios.lpTokenPrice[indexOfPortfolioWithReceivedToken]
        )
      )
      .div(ONE(18));

    let balances = {};
    let tvlUsd = 0;
    sdk.util.sumSingleBalance(
      balances,
      transform(portfolios.baseTokenAddress[indexOfPortfolioWithReceivedToken]),
      tvl.toString()
    );
    fixBalances(balances);
    // tvlUsd = (await sdk.util.computeTVL(balances, 'now')).usdTvl;
    tvlUsd = 0;

    const aprBase = rewardedFee / tvlUsd;
    const aprReward = rewardedStake / tvlUsd;

    const apyBase = tokensAddresses.includes(rewardToken)
      ? apy(aprBase, aprWeights)
      : aprBase;
    const apyReward = aprReward;

    // console.log(tokensSymbols);
    // console.log("aprBase:", aprBase.toString());
    // console.log("aprReward:", aprReward.toString());
    // console.log("apyBase:", apyBase.toString());
    // console.log("apyReward:", apyReward.toString());

    res.push({
      pool: farm.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'blueshift',
      symbol: tokensSymbols.join('-'),
      apyBase: TRANSFORM_TO_PERCENTS(apyBase),
      apyReward: TRANSFORM_TO_PERCENTS(apyReward),
      tvlUsd: tvlUsd,
      rewardTokens: [rewardToken],
      underlyingTokens: tokensAddresses,
      url: `https://app.blueshift.fi/#/farming?network=${config.network[chain]}`,
      poolMeta: portfolios.name[indexOfPortfolioWithReceivedToken],
    });
  }

  return res;
}

async function staking(chain, aprWeights, rewardToken, BLUES_PRICE) {
  const res = [];

  const stakings = (
    await sdk.api.abi.call({
      abi: abi.BlueshiftMinter.getStakings,
      chain: chain,
      target: config.minter[chain],
      params: [],
    })
  ).output;

  const stakingInfos = (
    await sdk.api.abi.call({
      abi: abi.BlueshiftMinter.getStatusStaking,
      chain: chain,
      target: config.minter[chain],
      params: [
        AddressZero,
        (await sdk.api.util.getLatestBlock(chain)).timestamp,
      ],
    })
  ).output;

  for (let staking of stakings) {
    const receivedToken = (
      await sdk.api.abi.call({
        abi: abi.BlueshiftEarning.getToken,
        chain: chain,
        target: staking,
        params: [],
      })
    ).output;

    const stakingInfo = stakingInfos.filter(
      (stakingInfo) => stakingInfo.farm === staking
    )[0];
    if (stakingInfo === undefined) {
      continue;
    }

    let tvl = stakingInfo.accDeposited;
    const tvlUsd = BigNumber.from(tvl).mul(BLUES_PRICE).div(ONE(18)).toString();

    const aprReward = BigNumber.from(stakingInfo.rewardPerBlock)
      .mul(BLOCKS_PER_YEAR)
      .mul(10000)
      .div(tvl);
    const apyReward = apy(
      Number(formatBigNumber(aprReward.toString(), 4)),
      aprWeights
    );

    // console.log("aprReward:", formatBigNumber(aprReward.toString(), 4));
    // console.log("apyReward:", apyReward.toString());

    res.push({
      pool: `${staking}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'blueshift',
      symbol: 'BLUES',
      apyBase: null,
      apyReward: TRANSFORM_TO_PERCENTS(apyReward),
      tvlUsd: Number(formatBigNumber(tvlUsd.toString(), 6)),
      rewardTokens: [rewardToken],
      underlyingTokens: [rewardToken],
      url: `https://app.blueshift.fi/#/staking?network=${config.network[chain]}`,
    });
  }

  return res;
}

async function poolsApy(chain) {
  const BLUES_PRICE = await getTokenVsUsdPrice('blueshift');

  const portfolios = (
    await sdk.api.abi.call({
      abi: abi.BlueshiftRegistry.getPortfolios,
      chain: chain,
      target: config.registry[chain],
      params: [],
    })
  ).output;

  const rewardToken = (
    await sdk.api.abi.call({
      abi: abi.BlueshiftMinter.token,
      chain: chain,
      target: config.minter[chain],
      params: [],
    })
  ).output;

  const aprWeights = (
    await sdk.api.abi.call({
      abi: abi.BlueshiftMinter.getAprWeights,
      chain: chain,
      target: config.minter[chain],
      params: [],
    })
  ).output;

  const farmingPools = await farming(
    chain,
    aprWeights,
    rewardToken,
    BLUES_PRICE,
    portfolios
  );
  const stakingPools = await staking(
    chain,
    aprWeights,
    rewardToken,
    BLUES_PRICE
  );

  return [...farmingPools, ...stakingPools].filter((i) => utils.keepFinite(i));
}

module.exports = {
  timetravel: false,
  apy: async () =>
    (
      await Promise.all(
        ['milkomeda', 'milkomeda_a1'].map(
          async (chain) => await poolsApy(chain)
        )
      )
    ).reduce((a, b) => [...a, ...b]),
};
