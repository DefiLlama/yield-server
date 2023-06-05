const sdk = require('@defillama/sdk');
const BigNumberJs = require('bignumber.js');
const ABI = require('./abi.json');
const utils = require('../utils');

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const REGISTRY_ADDRESS = '0xda820e20a89928e43794645b9a9770057d65738b';
const BOOSTER_ADDRESS = '0x6d12e3de6dacdba2779c4947c0f718e13b78cff4';

const KGL_TOKEN = '0x257f1a047948f73158dadd03eb84b34498bcdc60';
const MUUU_TOKEN = '0xc5bcac31cf55806646017395ad119af2441aee37';
const LAY_TOKEN = '0xc4335b1b76fa6d52877b3046eca68f6e708a27dd';
const WASTR_TOKEN = '0xaeaaf0e2c81af264101b9129c00f4440ccf0f720';

const MUKGL_REWARDS = '0x27e1076e8a9264718d5ef6824fb010ab6b7543b3';
const MUUU_REWARDS = '0xb2ae0cf4819f2be89574d3dc46d481cf80c7a255';

const KGL_API_BASE_URL = 'https://api.kagla.finance/api/kagla/';
const DEFAULT_DECIMALS = 18;
const MUUU_REWARD_MULTIPLIER = new BigNumberJs('0.0825');
const BN_ZERO = new BigNumberJs('0');

const getPoolInfo = async () => {
  const poolLength = (
    await sdk.api.abi.call({
      target: BOOSTER_ADDRESS,
      abi: ABI.poolLength,
      chain: 'astar',
    })
  ).output;

  const poolInfo = [];
  const calldata = [];
  for (let i = 0; i < poolLength; i++) {
    calldata.push({
      target: BOOSTER_ADDRESS,
      params: [i],
    });
  }
  const returnData = await sdk.api.abi.multiCall({
    abi: ABI.poolInfo,
    calls: calldata,
    chain: 'astar',
  });
  for (let i = 0; i < poolLength; i++) {
    const pdata = returnData.output[i].output;
    if (pdata.shutdown) continue;
    poolInfo.push({
      lptoken: pdata.lptoken,
      token: pdata.token,
      gauge: pdata.gauge,
      kglRewards: pdata.kglRewards,
      stash: pdata.stash,
    });
  }

  return poolInfo;
};

const getKaglaInfo = async () => {
  const { pools: kaglaPools } = await utils.getData(KGL_API_BASE_URL + 'pools');
  const kaglaCoins = await utils.getData(KGL_API_BASE_URL + 'coins');

  return { kaglaPools, kaglaCoins };
};

const getMarketPrices = async () => {
  const assets = {
    ASTR: `astar:${WASTR_TOKEN}`,
    LAY: `astar:${LAY_TOKEN}`,
    KGL: `astar:${KGL_TOKEN}`,
    MUUU: `astar:${MUUU_TOKEN}`,
  };
  const { coins: prices } = await utils.getData(
    `https://coins.llama.fi/prices/current/${Object.entries(assets)}`
  );

  return {
    [WASTR_TOKEN]: prices[assets.ASTR].price,
    [KGL_TOKEN]: prices[assets.KGL].price,
    [LAY_TOKEN]: prices[assets.LAY].price,
    [MUUU_TOKEN]: prices[assets.MUUU].price,
  };
};

const getRewardPools = async (poolInfo) => {
  const poolRewardPools = [
    MUKGL_REWARDS,
    MUUU_REWARDS,
    ...poolInfo.map((v) => v.kglRewards.toLowerCase()),
  ];

  const callData = poolRewardPools.map((rewardPool) => ({
    target: rewardPool,
  }));
  const rewardRates = (
    await sdk.api.abi.multiCall({
      abi: ABI.rewardRate,
      chain: 'astar',
      calls: callData,
    })
  ).output;
  const totalSupplies = (
    await sdk.api.abi.multiCall({
      abi: ABI.totalSupply,
      chain: 'astar',
      calls: callData,
    })
  ).output;

  return poolRewardPools.reduce((res, pool, index) => {
    return {
      ...res,
      [pool]: {
        rewardRate: new BigNumberJs(
          rewardRates[index].output / 10 ** DEFAULT_DECIMALS
        ),
        totalSupply: new BigNumberJs(
          totalSupplies[index].output / 10 ** DEFAULT_DECIMALS
        ),
      },
    };
  }, {});
};

const getExtraRewardInfos = async (poolInfo) => {
  const stashes = poolInfo.map((pool) => pool.stash);

  const callData = stashes.map((stash) => ({ target: stash }));
  const tokenCounts = (
    await sdk.api.abi.multiCall({
      abi: ABI.tokenCount,
      chain: 'astar',
      calls: callData,
    })
  ).output;

  const tokenCountsInStashes = stashes.map((stash, index) => ({
    stash,
    tokenCount: Number(tokenCounts[index].output),
  }));

  const tokenInfoLists = await Promise.all(
    tokenCountsInStashes.map(async (stash) => {
      const tokenList =
        stash.tokenCount > 0
          ? (
              await sdk.api.abi.multiCall({
                abi: ABI.tokenList,
                calls: [...Array(stash.tokenCount)].map((_, idx) => ({
                  target: stash.stash,
                  params: [idx],
                })),
                chain: 'astar',
              })
            ).output
          : [];

      const tokenInfo =
        stash.tokenCount > 0
          ? (
              await sdk.api.abi.multiCall({
                abi: ABI.tokenInfo,
                calls: tokenList.map((token) => ({
                  target: stash.stash,
                  params: [token.output],
                })),
                chain: 'astar',
              })
            ).output
          : [];

      const rewardRates =
        stash.tokenCount > 0
          ? (
              await sdk.api.abi.multiCall({
                abi: ABI.rewardRate,
                chain: 'astar',
                calls: tokenInfo.map((token) => ({
                  target: token.output.rewardAddress,
                })),
              })
            ).output
          : [];

      return {
        ...stash,
        tokenInfo: tokenList.map((token, index) => ({
          rewardTokenAddress: token.output,
          rewardAddress: tokenInfo[index].output.rewardAddress,
          rewardRate: new BigNumberJs(
            rewardRates[index].output / 10 ** DEFAULT_DECIMALS
          ),
        })),
      };
    })
  );

  return tokenInfoLists.reduce(
    (res, cur) => ({
      ...res,
      [cur.stash]: cur.tokenInfo,
    }),
    {}
  );
};

const getExtraRewardTokenStaticDatas = async (stashes) => {
  const tokens = Object.values(stashes).flatMap((stashValue) =>
    stashValue.map((v) => v.rewardTokenAddress)
  );

  const callData = tokens.map((token) => ({ target: token }));

  const names = (
    await sdk.api.abi.multiCall({
      abi: ABI.name,
      chain: 'astar',
      calls: callData,
    })
  ).output;

  const symbols = (
    await sdk.api.abi.multiCall({
      abi: ABI.symbol,
      chain: 'astar',
      calls: callData,
    })
  ).output;

  const decimals = (
    await sdk.api.abi.multiCall({
      abi: ABI.decimals,
      chain: 'astar',
      calls: callData,
    })
  ).output;

  return tokens.reduce(
    (res, token, index) => ({
      ...res,
      [token]: {
        name: names[index].output,
        symbol: symbols[index].output,
        decimals: decimals[index].output,
      },
    }),
    {}
  );
};

const getMuuuToken = async () => {
  const MUUU_TOKEN_FIELDS = [
    'reductionPerCliff',
    'totalCliffs',
    'maxSupply',
    'totalSupply',
    'decimals',
  ];

  const [reductionPerCliff, totalCliffs, maxSupply, totalSupply, decimals] =
    await Promise.all(
      MUUU_TOKEN_FIELDS.map(
        async (field) =>
          (
            await sdk.api.abi.call({
              abi: ABI[field],
              target: MUUU_TOKEN,
              chain: 'astar',
            })
          ).output
      )
    );

  return {
    address: MUUU_TOKEN,
    reductionPerCliff: new BigNumberJs(reductionPerCliff),
    totalCliffs: new BigNumberJs(totalCliffs),
    maxSupply: new BigNumberJs(maxSupply),
    totalSupply: new BigNumberJs(totalSupply),
    decimals: new BigNumberJs(decimals),
  };
};

const findKaglaPoolFromPoolInfo = (gaugeAddress, kaglaPools) => {
  const matched = kaglaPools
    .map((p) => {
      if (!p.gauges) return null;
      const matchedGauges = p.gauges.filter(
        (gauge) => gauge.address.toLowerCase() == gaugeAddress.toLowerCase()
      );
      if (matchedGauges.length != 1) return null;
      return {
        pool: p,
        gauge: matchedGauges[0],
      };
    })
    .filter((v) => v != null);
  return matched.length == 1 ? matched[0] : null;
};

const attachSymbolToCoinAddresses = (coins, kaglaCoins) => {
  const _coins = [];
  for (const c of coins) {
    const finded = kaglaCoins.find(
      (kaglaC) => kaglaC.address.toLowerCase() == c.address.toLowerCase()
    );
    if (finded == undefined) return null;
    _coins.push({
      address: c.address,
      symbol: finded.symbol,
    });
  }
  return _coins;
};

const AssetType = {
  USD: '0',
  ASTR: '5',
  KGL: '6',
  LAY: '7',
};
const convertLpTokenPriceToUsd = (assetType, lpTokenPrice, prices) => {
  const _lpTokenPrice = new BigNumberJs(lpTokenPrice / 10 ** DEFAULT_DECIMALS);
  if (assetType == AssetType.USD) return _lpTokenPrice;
  if (assetType == AssetType.ASTR)
    return _lpTokenPrice.multipliedBy(prices.astr);
  if (assetType == AssetType.KGL) return _lpTokenPrice.multipliedBy(prices.kgl);
  if (assetType == AssetType.LAY) return _lpTokenPrice.multipliedBy(prices.lay);
  return null;
};

const calcurateMuuuEarned = (rewardEarned, muuuInfo) => {
  const { totalSupply, reductionPerCliff, totalCliffs, maxSupply } = muuuInfo;
  const currentCliff = totalSupply.dividedBy(reductionPerCliff);
  if (currentCliff.gte(totalCliffs)) return BN_ZERO;
  const remaining = totalCliffs.minus(currentCliff);
  const muuuEarned = rewardEarned
    .multipliedBy(MUUU_REWARD_MULTIPLIER)
    .multipliedBy(remaining)
    .dividedBy(totalCliffs);
  const amountTillMax = maxSupply.minus(totalSupply);

  return muuuEarned.gt(amountTillMax) ? amountTillMax : muuuEarned;
};

const convertAPR2APY = (apr) => {
  return (apy = Math.pow(apr / 12 + 1, 12) - 1);
};

module.exports = {
  getPoolInfo,
  getKaglaInfo,
  getMarketPrices,
  getRewardPools,
  getExtraRewardInfos,
  getExtraRewardTokenStaticDatas,
  getMuuuToken,
  findKaglaPoolFromPoolInfo,
  attachSymbolToCoinAddresses,
  convertLpTokenPriceToUsd,
  calcurateMuuuEarned,
  convertAPR2APY,
  KGL_TOKEN,
  MUUU_TOKEN,
  LAY_TOKEN,
  WASTR_TOKEN,
  BN_ZERO,
};
