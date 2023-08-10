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

const url = 'https://api.thegraph.com/subgraphs/name/harleen-m/alienswap';
const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      totalSupply
      volumeUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;
const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
    }
  }
`;
const queryAlbPrice = gql`
  {
    token(id: "<PLACEHOLDER>") {
      derivedETH
    }
  }
`;

const getPoolDetails = async (block, poolInfo, chainString) => {
  const poolDetails = [];

  // console.log(poolInfo);
  for (let i = 0; i < poolInfo.length; i++) {
    // for (let i = 0; i < 3; i++) {
    // console.log(`\nreserves for [${poolInfo[i].lpToken}]`);
    if (poolInfo[i].lpToken != '0x1dd2d631c92b1aCdFCDd51A0F7145A50130050C4') {
      const token0Id = (
        await sdk.api.abi.call({
          target: poolInfo[i].lpToken,
          abi: poolAbi.find((m) => m.name === 'token0'),
          chain: chainString,
        })
      ).output;
      const token0Name = (
        await sdk.api.abi.call({
          target: token0Id,
          abi: poolAbi.find((m) => m.name === 'name'),
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
      const token1Name = (
        await sdk.api.abi.call({
          target: token1Id,
          abi: poolAbi.find((m) => m.name === 'name'),
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
            symbol: token0Name,
            id: token0Id,
          },
          token1: {
            symbol: token1Name,
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
            symbol: token0Name,
            id: token0Id,
          },
          token1: {
            symbol: token1Name,
            id: token1Id,
          },
        });
      }
    }
  }

  return poolDetails;
};

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
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
  poolInfo = poolInfo.filter(
    (obj, index, self) =>
      index === self.findIndex((o) => o.lpToken === obj.lpToken)
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

  // let queryAlbPriceC = queryAlbPrice;
  // let albPrice = await request(
  //   url,
  //   queryAlbPriceC.replace('<PLACEHOLDER>', ALB)
  // );
  // albPrice = albPrice.token.derivedETH * wethPrice;
  albPrice = (
    await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${ALB}`)
  ).data.pairs[0]?.priceUsd;

  const albPerYearUsd = albPerSec * 86400 * 365 * albPrice;

  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    chainString,
    timestamp,
    [url],
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
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
    const obj2 = dataNow.find((obj2) => obj2.id === obj1.id);
    if (obj2) {
      return {
        ...obj1,
        totalValueLockedUSD: obj2.totalValueLockedUSD,
        price0: obj2.price0,
        price1: obj2.price1,
      };
    }
    return obj1;
  });

  console.log('dataNowUpdated', dataNowUpdated);

  // console.log(
  //   'TVL',
  //   dataNow.reduce((sum, obj) => sum + obj.totalValueLockedUSD, 0)
  // );

  // calculate apy
  dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  dataNow = dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString;
    const url = `https://app.alienbase.xyz/add/${token0}/${token1}`;

    const albAllocPoint = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.allocPoint;

    let totalDeposit = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.totalDeposit;
    totalDeposit = new BigNumber(totalDeposit)
      .dividedBy(new BigNumber(10).pow(18))
      .toFixed(18);
    const ratio = totalDeposit / p.totalSupply || 1;

    const albApyReward =
      (((albAllocPoint / albTotalAllocPoint) * albPerYearUsd) /
        (p.totalValueLockedUSD * ratio)) *
      100;

    const apyReward = albApyReward || 0;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'alien-base',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: 0,
      apyBase7d: 0,
      apyReward,
      rewardTokens: apyReward > 0 ? [ALB] : [],
      underlyingTokens,
      url,
      volumeUsd1d: p?.volumeUSD1d || 0,
      volumeUsd7d: p?.volumeUSD7d || 0,
    };
  });

  // return only pools with apyReward > 0
  dataNow = dataNow.filter((el) => el.apyReward > 0);

  return dataNow;
};

const main = async (timestamp = Date.now() / 1000) => {
  let data = await topLvl('base', url, query, queryPrior, 'v2', timestamp);

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
