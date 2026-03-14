const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');

const {
  zfFarmABI,
  zfTokenABI,
  zfFactory,
  zfGOVAbi,
  zfLpABI,
} = require('./abis');
const utils = require('../utils');

const ZFFarm = '0x9f9d043fb77a194b4216784eb5985c471b979d67';
const ZFToken = '0x31c2c031fdc9d33e974f327ab0d9883eae06ca4a';
const ZFFactory = '0x3a76e377ed58c8731f9df3a36155942438744ce3';
const ZF_GOV = '0x4ca2ac3513739cebf053b66a1d59c88d925f1987';
const DAO_START_TIME = 1697716800;

const SECOND_PER_DAY = 60 * 60 * 24;
const DAY_PER_YEAR = 365;
const SECOND_PER_YEAR = SECOND_PER_DAY * DAY_PER_YEAR;
const CHAIN = 'era';

const SWAP_EVENT_ABI =
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)';

const apy = async () => {
  const nonLpPools = [0];

  const poolsCount = (
    await sdk.api.abi.call({
      abi: zfFarmABI.find(({ name }) => name === 'poolLength'),
      target: ZFFarm,
      chain: CHAIN,
    })
  ).output;

  const totalAllocPoint = Number(
    (
      await sdk.api.abi.call({
        abi: zfFarmABI.find(({ name }) => name === 'totalAllocPoint'),
        target: ZFFarm,
        chain: CHAIN,
      })
    ).output
  );

  const zfPerSecond =
    Number(
      (
        await sdk.api.abi.call({
          abi: zfFarmABI.find(({ name }) => name === 'zfPerSecond'),
          target: ZFFarm,
          chain: CHAIN,
        })
      ).output
    ) / 1e18;

  const protocolFee = (
    await sdk.api.abi.call({
      abi: zfFactory.find(({ name }) => name === 'protocolFeeFactor'),
      target: ZFFactory,
      chain: CHAIN,
    })
  ).output;

  const poolsRes = await sdk.api.abi.multiCall({
    abi: zfFarmABI.filter(({ name }) => name === 'poolInfo')[0],
    calls: [...Array(Number(poolsCount)).keys()].map((i) => ({
      target: ZFFarm,
      params: i,
    })),
    chain: CHAIN,
    requery: true,
  });
  const pools = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter(({ i }) => !nonLpPools.includes(i));

  const lpTokens = pools.map(({ lpToken }) => lpToken);

  const lpTokensSwapFeeCall = await sdk.api.abi.multiCall({
    abi: zfLpABI.filter(({ name }) => name === 'getSwapFee')[0],
    calls: lpTokens.map((lpAddress) => ({
      target: lpAddress,
    })),
    chain: CHAIN,
    requery: true,
    permitFailure: true,
  });

  const lpTokensSwapFee = lpTokensSwapFeeCall.output.reduce(
    (lpSwapFeeObj, item, index, arr) => {
      lpSwapFeeObj[lpTokens[index]?.toLowerCase()] = item?.output;
      return lpSwapFeeObj;
    },
    {}
  );

  const nonLpPoolList = poolsRes.output
    .map(({ output }, i) => ({ ...output, i }))
    .filter(({ i }) => nonLpPools.includes(i));

  const nonLpToken = nonLpPoolList.map(({ lpToken }) => lpToken);

  const [reservesData, supplyData, zfFarmBalData] = await Promise.all(
    ['getReserves', 'totalSupply', 'balanceOf'].map((method) =>
      makeMulticall(
        zfTokenABI.filter(({ name }) => name === method)[0],
        lpTokens,
        CHAIN,
        method === 'balanceOf' ? [ZFFarm] : null
      )
    )
  );
  const [tokens0, tokens1] = await Promise.all(
    ['token0', 'token1'].map((method) =>
      makeMulticall(
        zfTokenABI.filter(({ name }) => name === method)[0],
        lpTokens,
        CHAIN
      )
    )
  );

  const allTokens = [...new Set([...tokens0, ...tokens1].filter(Boolean))];

  const { pricesByAddress: tokensPrices } = await utils.getPrices(
    allTokens,
    CHAIN
  );

  // Build pair info from on-chain data
  const [tokenDecimals, tokenSymbols] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'erc20:decimals',
      calls: allTokens.map((t) => ({ target: t })),
      chain: CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: 'erc20:symbol',
      calls: allTokens.map((t) => ({ target: t })),
      chain: CHAIN,
      permitFailure: true,
    }),
  ]);

  const tokenInfo = {};
  allTokens.forEach((t, i) => {
    tokenInfo[t.toLowerCase()] = {
      id: t.toLowerCase(),
      decimals: tokenDecimals.output[i]?.output || '18',
      symbol: tokenSymbols.output[i]?.output || 'UNKNOWN',
    };
  });

  const pairsInfo = {};
  lpTokens.forEach((lp, i) => {
    const t0 = tokens0[i]?.toLowerCase();
    const t1 = tokens1[i]?.toLowerCase();
    if (t0 && t1 && tokenInfo[t0] && tokenInfo[t1]) {
      pairsInfo[lp.toLowerCase()] = {
        token0: tokenInfo[t0],
        token1: tokenInfo[t1],
        name: `${tokenInfo[t0].symbol}-${tokenInfo[t1].symbol}`,
      };
    }
  });

  const currentTime = Math.round(new Date().getTime() / 1000);

  // Get 24h volume from on-chain Swap event logs
  let volumeMap = {};
  try {
    const latestBlock = await sdk.api.util.getLatestBlock(CHAIN);
    const fromBlock = (
      await sdk.api.util.lookupBlock(latestBlock.timestamp - SECOND_PER_DAY, {
        chain: CHAIN,
      })
    ).block;

    const volumes = await Promise.all(
      lpTokens.map(async (lp, idx) => {
        try {
          const logs = await sdk.getEventLogs({
            chain: CHAIN,
            target: lp,
            eventAbi: SWAP_EVENT_ABI,
            fromBlock,
            toBlock: latestBlock.number,
          });

          const t0 = tokens0[idx]?.toLowerCase();
          const t1 = tokens1[idx]?.toLowerCase();
          const dec0 = Number(tokenInfo[t0]?.decimals || 18);
          const dec1 = Number(tokenInfo[t1]?.decimals || 18);
          const price0 = tokensPrices[t0] || 0;
          const price1 = tokensPrices[t1] || 0;

          let vol = 0;
          for (const log of logs) {
            try {
              const amount0In = new BigNumber(log.args.amount0In.toString());
              const amount1In = new BigNumber(log.args.amount1In.toString());
              vol += amount0In
                .div(new BigNumber(10).pow(dec0))
                .times(price0)
                .plus(
                  amount1In.div(new BigNumber(10).pow(dec1)).times(price1)
                )
                .toNumber();
            } catch (e) {
              // Skip malformed log entries
            }
          }

          return { lp: lp.toLowerCase(), volume: vol };
        } catch (e) {
          return { lp: lp.toLowerCase(), volume: 0 };
        }
      })
    );

    volumeMap = volumes.reduce((acc, { lp, volume }) => {
      acc[lp] = volume;
      return acc;
    }, {});
  } catch (e) {
    console.log('Failed to fetch on-chain volume data:', e.message);
  }

  const [tvl] = await makeMulticall(
    zfTokenABI.filter(({ name }) => name === 'balanceOf')[0],
    nonLpToken,
    CHAIN,
    [ZFFarm]
  );
  const nonLpTvl = tvl / 1e18;
  const nonLpRes = nonLpPoolList
    .map((pool, i) => {
      const poolInfo = pool;
      const poolWeight = poolInfo.allocPoint / totalAllocPoint;
      const totalRewardPricePerYear =
        tokensPrices[ZFToken] * poolWeight * zfPerSecond * SECOND_PER_YEAR;
      const totalStakingTokenInPool = tokensPrices[ZFToken] * nonLpTvl;
      const apyReward =
        (totalRewardPricePerYear / totalStakingTokenInPool) * 100;
      return {
        pool: poolInfo.lpToken,
        chain: CHAIN,
        project: 'zkswap-v2',
        symbol: 'ZF',
        tvlUsd: totalStakingTokenInPool,
        apyBase: 0,
        apyReward,
        underlyingTokens: [poolInfo.lpToken.toLowerCase()],
        rewardTokens: [ZFToken],
        url: 'https://zkswap.finance/earn',
      };
    })
    .filter((pool) => utils.keepFinite(pool));

  let govPool = null;
  try {
    const [zfDAOPerSecondRes, pendingZfRes, currentGovTvlRes] =
      await Promise.all([
        sdk.api.abi.call({
          abi: zfGOVAbi.filter(({ name }) => name === 'zfPerSecond')[0],
          target: ZF_GOV,
          chain: CHAIN,
        }),
        sdk.api.abi.call({
          abi: zfGOVAbi.filter(({ name }) => name === 'pendingZF')[0],
          target: ZF_GOV,
          chain: CHAIN,
        }),
        sdk.api.abi.call({
          abi: zfGOVAbi.filter(({ name }) => name === 'balance')[0],
          target: ZF_GOV,
          chain: CHAIN,
        }),
      ]);

    const zfDAOPerSecond = Number(zfDAOPerSecondRes.output) / 1e18;
    const pendingZf = Number(pendingZfRes.output) / 1e18;
    const currentGovTvl = Number(currentGovTvlRes.output) / 1e18;

    const zfRewardDAOUntilNow =
      (currentTime - DAO_START_TIME) * zfDAOPerSecond;
    const govTvl =
      (currentGovTvl + pendingZf - zfRewardDAOUntilNow) *
      tokensPrices[ZFToken];
    const govFarmAPY =
      ((zfDAOPerSecond * SECOND_PER_YEAR * tokensPrices[ZFToken]) / govTvl) *
      100;

    govPool = {
      pool: ZF_GOV,
      chain: CHAIN,
      project: 'zkswap-v2',
      symbol: 'ZF',
      tvlUsd: govTvl,
      apyBase: 0,
      apyReward: govFarmAPY,
      underlyingTokens: [ZFToken],
      rewardTokens: [ZFToken],
      url: 'https://zkswap.finance/earn',
    };
  } catch (e) {
    console.log('Gov pool data unavailable:', e.message);
  }

  const res = pools.map((pool, i) => {
    const poolInfo = pool;
    const reserves = reservesData[i];
    const pairInfo = pairsInfo[pool.lpToken.toLowerCase()];

    if (!pairInfo) return {};

    const supply = supplyData[i];
    const zfFarmBalance = zfFarmBalData[i];

    const lpReservesUsd = utils.uniswap
      .calculateReservesUSD(
        reserves,
        1,
        pairInfo?.token0,
        pairInfo?.token1,
        tokensPrices
      )
      .toString();

    const fee = lpTokensSwapFee[pool.lpToken.toLowerCase()];
    const feeRate = (fee * (1 - 1 / protocolFee)) / 10000;

    const lpFees24h =
      (volumeMap[pool.lpToken.toLowerCase()] || 0) * feeRate;

    const apyBase = ((lpFees24h * DAY_PER_YEAR) / lpReservesUsd) * 100;

    const farmRatio =
      supply && zfFarmBalance ? zfFarmBalance / supply : 0;
    const zfFarmReservesUsd = Number(lpReservesUsd) * farmRatio;

    const apyReward = utils.uniswap.calculateApy(
      poolInfo,
      totalAllocPoint,
      zfPerSecond,
      tokensPrices[ZFToken],
      zfFarmReservesUsd || 1,
      SECOND_PER_YEAR
    );

    return {
      pool: pool.lpToken,
      chain: CHAIN,
      project: 'zkswap-v2',
      symbol: pairInfo.name,
      tvlUsd: Number(lpReservesUsd),
      apyBase,
      apyReward,
      underlyingTokens:
        tokens0[i] && tokens1[i]
          ? [tokens0[i], tokens1[i]]
          : [poolInfo.address.toLowerCase()],
      rewardTokens: [ZFToken],
      url: 'https://zkswap.finance/earn',
    };
  });
  return [...nonLpRes, ...res, ...(govPool ? [govPool] : [])].filter((i) =>
    utils.keepFinite(i)
  );
};

const makeMulticall = async (abi, addresses, chain, params = null) => {
  const data = await sdk.api.abi.multiCall({
    abi,
    calls: addresses.map((address) => ({
      target: address,
      params,
    })),
    chain,
    permitFailure: true,
  });

  const res = data.output.map(({ output }) => output);

  // Retry failed calls individually
  const retries = [];
  for (let i = 0; i < res.length; i++) {
    if (res[i] === null) {
      retries.push(
        sdk.api.abi
          .call({ abi, target: addresses[i], chain, params })
          .then(({ output }) => {
            res[i] = output;
          })
          .catch(() => {})
      );
    }
  }
  if (retries.length > 0) await Promise.all(retries);

  return res;
};

module.exports = {
  timetravel: false,
  apy,
};
