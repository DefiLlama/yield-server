const sdk = require('@defillama/sdk4');
const { request, gql } = require('graphql-request');
const masterchefAbi = require('./masterchef');
const poolAbi = require('./poolAbi');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const masterchef = '0x52eaecac2402633d98b95213d0b473e069d86590';
const ALB = '0x1dd2d631c92b1aCdFCDd51A0F7145A50130050C4';
const WETH = '0x4200000000000000000000000000000000000006';

const utils = require('../utils');

const getPoolDetails = async (block, poolInfo, chainString) => {
  const poolDetails = [];

  // console.log(poolInfo);
  for (let i = 0; i < poolInfo.length; i++) {
    // SKIP LP OF ALB STANDALONE
    if (
      ![
        '0x1dd2d631c92b1aCdFCDd51A0F7145A50130050C4',
        '0x840dCB7b4d3cEb906EfD00c8b5F5c5Dd61d7f8a6',
        '0xfA52C8902519e4Da95C3C520039C676d5bD4d9a2'
      ].includes(poolInfo[i].lpToken)
    ) {
      const token0Id = (
        await sdk.api.abi.call({
          target: poolInfo[i].lpToken,
          abi: poolAbi.find((m) => m.name === 'token0'),
          chain: chainString,
        })
      ).output;
      const token0Symbol = (
        await sdk.api.abi.call({
          target: token0Id,
          abi: poolAbi.find((m) => m.name === 'symbol'),
          chain: chainString,
        })
      ).output;
      const token0Decimals = (
        await sdk.api.abi.call({
          target: token0Id,
          abi: poolAbi.find((m) => m.name === 'decimals'),
          chain: chainString,
        })
      ).output;
      const token1Id = (
        await sdk.api.abi.call({
          target: poolInfo[i].lpToken,
          abi: poolAbi.find((m) => m.name === 'token1'),
          chain: chainString,
        })
      ).output;
      const token1Symbol = (
        await sdk.api.abi.call({
          target: token1Id,
          abi: poolAbi.find((m) => m.name === 'symbol'),
          chain: chainString,
        })
      ).output;
      const token1Decimals = (
        await sdk.api.abi.call({
          target: token1Id,
          abi: poolAbi.find((m) => m.name === 'decimals'),
          chain: chainString,
        })
      ).output;

      try {
        const reserves = (
          await sdk.api.abi.call({
            target: poolInfo[i].lpToken,
            abi: poolAbi.find((m) => m.name === 'getReserves'),
            block: block,
            chain: chainString,
          })
        ).output;

        const lpDecimals = (
          await sdk.api.abi.call({
            target: poolInfo[i].lpToken,
            abi: poolAbi.find((m) => m.name === 'decimals'),
            block: block,
            chain: chainString,
          })
        ).output;

        const totalSupply = (
          await sdk.api.abi.call({
            target: poolInfo[i].lpToken,
            abi: poolAbi.find((m) => m.name === 'totalSupply'),
            block: block,
            chain: chainString,
          })
        ).output;

        poolDetails.push({
          id: poolInfo[i].lpToken,
          reserve0: reserves._reserve0 / (1 * 10 ** token0Decimals),
          reserve1: reserves._reserve1 / (1 * 10 ** token1Decimals),
          totalSupply: totalSupply,
          volumeUSD: 0,
          token0: {
            symbol: token0Symbol,
            id: token0Id,
          },
          token1: {
            symbol: token1Symbol,
            id: token1Id,
          },
        });
      } catch (e) {
        poolDetails.push({
          id: poolInfo[i].lpToken,
          reserve0: 0,
          reserve1: 0,
          totalSupply: 0,
          volumeUSD: 0,
          token0: {
            symbol: token0Symbol,
            id: token0Id,
          },
          token1: {
            symbol: token1Symbol,
            id: token1Id,
          },
        });
      }
    } else {
      try {
        const lpDecimals = (
          await sdk.api.abi.call({
            target: poolInfo[i].lpToken,
            abi: poolAbi.find((m) => m.name === 'decimals'),
            block: block,
            chain: chainString,
          })
        ).output;

        const totalSupply = (
          await sdk.api.abi.call({
            target: poolInfo[i].lpToken,
            abi: poolAbi.find((m) => m.name === 'totalSupply'),
            block: block,
            chain: chainString,
          })
        ).output;

        const tokenId = poolInfo[i].lpToken;
        const tokenSymbol = 'ALB';
        const tokenDecimals = 18;

        poolDetails.push({
          id: poolInfo[i].lpToken,
          reserve0: 0,
          reserve1: 0,
          totalSupply: totalSupply,
          volumeUSD: 0,
          token0: {
            symbol: tokenSymbol,
            id: tokenId,
          },
          token1: {
            symbol: tokenSymbol,
            id: tokenId,
          },
        });
      } catch (e) {
        poolDetails.push({
          id: poolInfo[i].lpToken,
          reserve0: 0,
          reserve1: 0,
          totalSupply: 0,
          volumeUSD: 0,
          token0: {
            symbol: token0Symbol,
            id: token0Id,
          },
          token1: {
            symbol: token1Symbol,
            id: token1Id,
          },
        });
      }
    }
  }

  return poolDetails;
};

const topLvl = async (chainString, version, timestamp) => {
  const poolLength = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'poolLength'),
      chain: chainString,
    })
  ).output;

  let poolInfo = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolLength)).keys()].map((i) => ({
        target: masterchef,
        params: [i],
      })),
      abi: masterchefAbi.find((m) => m.name === 'poolInfo'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  const exclude = ['0x840dCB7b4d3cEb906EfD00c8b5F5c5Dd61d7f8a6'];

  poolInfo = poolInfo.filter(
    (obj, index, self) =>
      index === self.findIndex((o) => o.lpToken === obj.lpToken) &&
      !exclude.includes(obj.lpToken)
  );

  const albTotalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'totalAllocPoint'),
      chain: chainString,
    })
  ).output;

  const albPerSec =
    (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'albPerSec'),
        chain: chainString,
      })
    ).output / 1e18;

  const wethPriceKey = `base:${WETH}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;

  albPrice = (
    await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${ALB}`)
  ).data.pairs[0]?.priceUsd;

  const albPerYearUsd = albPerSec * 86400 * 365 * albPrice;

  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, []);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [],
    604800
  );

  // pull data
  let dataNow = await getPoolDetails(block, poolInfo, chainString);

  // pull data 24h offest
  let dataPrior = await getPoolDetails(blockPrior, poolInfo, chainString);

  // pull data 7d offest
  let dataPrior7d = await getPoolDetails(blockPrior7d, poolInfo, chainString);

  const dataNowOriginal = dataNow.map((el) => JSON.parse(JSON.stringify(el)));
  const dataNowCopy = dataNow.map((el) => JSON.parse(JSON.stringify(el)));

  dataNowCopy.forEach((pool) => {
    if (pool.token0.id == '0x1dd2d631c92b1aCdFCDd51A0F7145A50130050C4') {
      pool.token0.id = pool.token1.id;
      pool.token0.symbol = pool.token1.symbol;
      pool.reserve0 = pool.reserve1;
    } else if (pool.token1.id == '0x1dd2d631c92b1aCdFCDd51A0F7145A50130050C4') {
      pool.token1.id = pool.token0.id;
      pool.token1.symbol = pool.token0.symbol;
      pool.reserve1 = pool.reserve0;
    }
  });

  // calculate tvl
  dataNow = await utils.tvl(dataNowCopy, chainString);

  const dataNowUpdated = dataNowOriginal.map((obj1) => {
    const isAlbStake = obj1.id == ALB;
    const obj2 = dataNow.find((obj2) => obj2.id === obj1.id);
    if (obj2) {
      return {
        ...obj1,
        totalValueLockedUSD: isAlbStake
          ? (poolInfo[0].totalLp / 1e18) * albPrice
          : obj2.totalValueLockedUSD,
        price0: isAlbStake ? albPrice : obj2.price0,
        price1: isAlbStake ? albPrice : obj2.price1,
      };
    }
    return obj1;
  });

  console.log('dataNowUpdated', dataNowUpdated);

  // calculate apy
  dataNow = dataNowUpdated.map((el) =>
    utils.apy(el, dataPrior, dataPrior7d, version)
  );

  dataNow = dataNow.map((p) => {
    const isAlbStake = p.id == ALB;
    const symbol = isAlbStake
      ? p.token0.symbol
      : utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString;
    const url = isAlbStake
      ? `https://app.alienbase.xyz/swap`
      : `https://app.alienbase.xyz/add/${token0}/${token1}`;

    const albAllocPoint = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.allocPoint;

    console.log(symbol, albAllocPoint);

    let totalDeposit = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.totalDeposit;
    totalDeposit = new BigNumber(totalDeposit)
      .dividedBy(new BigNumber(10).pow(18))
      .toFixed(18);
    const ratio = totalDeposit / p.totalSupply || 1;

    const albBaseApy =
      (((albAllocPoint / albTotalAllocPoint) * albPerYearUsd) /
        (p.totalValueLockedUSD * ratio)) *
      100 *
      0.85; // deducted by fee as other aggeregator and app shows

    const apyReward = 0;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'alien-base-amm',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: albBaseApy || 0,
      apyBase7d: 0,
      apyReward,
      rewardTokens: apyReward > 0 || isAlbStake ? [ALB] : [],
      underlyingTokens,
      url,
      volumeUsd1d: p?.volumeUSD1d || 0,
      volumeUsd7d: p?.volumeUSD7d || 0,
    };
  });

  return dataNow;
};

const main = async (timestamp = Date.now() / 1000) => {
  let data = await topLvl('base', 'v2', timestamp);

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
