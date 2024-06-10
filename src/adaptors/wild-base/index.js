const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const masterchefAbi = require('./masterchef');
const poolAbi = require('./poolAbi');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const masterchef = '0x3eAB0C9716b0aA98CdC4c3ae317d69dE301ef247';
const WILDx = '0xbCDa0bD6Cd83558DFb0EeC9153eD9C9cfa87782E';
const WETH = '0x4200000000000000000000000000000000000006';

const utils = require('../utils');

const getPoolDetails = async (block, poolInfo, chainString) => {
  const poolDetails = [];

  // console.log(poolInfo);
  for (let i = 0; i < poolInfo.length; i++) {
    // SKIP LP OF WILDx STANDALONE
    if (poolInfo[i].lpToken != '0xbCDa0bD6Cd83558DFb0EeC9153eD9C9cfa87782E') {
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
        const tokenSymbol = 'WILDx';
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

const topLv = async (chainString, version, timestamp) => {
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

  const exclude = [
    '0x4200000000000000000000000000000000000006',
    '0x79474223AEdD0339780baCcE75aBDa0BE84dcBF9',
  ];

  poolInfo = poolInfo.filter(
    (obj, index, self) =>
      index === self.findIndex((o) => o.lpToken === obj.lpToken) &&
      !exclude.includes(obj.lpToken)
  );

  const WILDxTotalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'totalAllocPoint'),
      chain: chainString,
    })
  ).output;
  const WILDxPerSec =
    (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'wildxPerBlock'),
        chain: chainString,
      })
    ).output / 1e18;

  const wethPriceKey = `base:${WETH}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;

  WILDxPrice = (
    await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${WILDx}`)
  ).data.pairs[0]?.priceUsd;

  const WILDxPerYearUsd = WILDxPerSec * 86400 * 365 * WILDxPrice;

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
    if (pool.token0.id == '0xbCDa0bD6Cd83558DFb0EeC9153eD9C9cfa87782E') {
      pool.token0.id = pool.token1.id;
      pool.token0.symbol = pool.token1.symbol;
      pool.reserve0 = pool.reserve1;
    } else if (pool.token1.id == '0xbCDa0bD6Cd83558DFb0EeC9153eD9C9cfa87782E') {
      pool.token1.id = pool.token0.id;
      pool.token1.symbol = pool.token0.symbol;
      pool.reserve1 = pool.reserve0;
    }
  });

  // calculate tvl
  dataNow = await utils.tvl(dataNowCopy, chainString);

  const dataNowUpdated = dataNowOriginal.map((obj1) => {
    const isWILDxStake = obj1.id == WILDx;
    const obj2 = dataNow.find((obj2) => obj2.id === obj1.id);
    if (obj2) {
      return {
        ...obj1,
        totalValueLockedUSD: isWILDxStake
          ? (poolInfo[0].totalLp / 1e18) * WILDxPrice
          : obj2.totalValueLockedUSD,
        price0: isWILDxStake ? WILDxPrice : obj2.price0,
        price1: isWILDxStake ? WILDxPrice : obj2.price1,
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
    const isWILDxStake = p.id == WILDx;
    const symbol = isWILDxStake
      ? p.token0.symbol
      : utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString;
    const url = isWILDxStake
      ? `https://pancakeswap.finance/swap`
      : `https://pancakeswap.finance/add/${token0}/${token1}`;

    const WILDxAllocPoint = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.allocPoint;

    console.log(symbol, WILDxAllocPoint);

    let totalDeposit = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.totalDeposit;
    totalDeposit = new BigNumber(totalDeposit)
      .dividedBy(new BigNumber(10).pow(18))
      .toFixed(18);
    const ratio = totalDeposit / p.totalSupply || 1;

    const WILDxBaseApy =
      (((WILDxAllocPoint / WILDxTotalAllocPoint) * WILDxPerYearUsd) /
        (p.totalValueLockedUSD * ratio)) *
      100; // deducted by fee as other aggeregator and app shows

    const apyReward = 0;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'wild-base',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: WILDxBaseApy || 0,
      apyBase7d: 0,
      apyReward,
      rewardTokens: apyReward > 0 || isWILDxStake ? [WILDx] : [],
      underlyingTokens,
      url,
      volumeUsd1d: p?.volumeUSD1d || 0,
      volumeUsd7d: p?.volumeUSD7d || 0,
    };
  });

  return dataNow;
};

const main = async (timestamp = Date.now() / 1000) => {
  let data = await topLv('base', 'v3', timestamp);

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
