const sdk = require('@defillama/sdk');
const farmABI = require('./farmABI');
const earnABI = require('./earnABI');
const pairABI = require('./pairABI');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const utils = require('../utils');

const chain = 'bsc';

const project = 'hydt-protocol';

const earn = '0x8e48d5b2Ac80d9861d07127F06BbF02F73520Ced';
const farm = '0x4590BaD61aE62ACFF33032e3Bf64b52b7264A779';
const hydt = '0x9810512Be701801954449408966c630595D0cD51';
const hygt = '0x100995a7e5fFd8Ee60cc18A10C75CEe8C572c59b';

const hygtPair = [{ lpToken: '0xE0e9bBc7aE8EBE4D74065F6EBD710665DA285a0B' }];

const getEarnPoolInfo = async (block, poolInfo) => {
  const apys = [16, 20, 30];
  const poolDetails = [];

  for (let i = 0; i < poolInfo.length; i++) {
    poolDetails.push({
      id: poolInfo[i].stakeType,
      allocPoint: poolInfo[i].allocPoint,
      totalDeposit: poolInfo[i].stakeSupply,
      apy: apys[i],
    });
  }

  return poolDetails;
};

const getFarmPoolInfo = async (block, poolInfo) => {
  const poolDetails = [];

  for (let i = 0; i < poolInfo.length; i++) {
    const token0Id = (
      await sdk.api.abi.call({
        target: poolInfo[i].lpToken,
        abi: pairABI.find((m) => m.name === 'token0'),
        chain,
      })
    ).output;
    const token0Symbol = (
      await sdk.api.abi.call({
        target: token0Id,
        abi: pairABI.find((m) => m.name === 'symbol'),
        chain,
      })
    ).output;
    const token0Decimals = (
      await sdk.api.abi.call({
        target: token0Id,
        abi: pairABI.find((m) => m.name === 'decimals'),
        chain,
      })
    ).output;
    const token1Id = (
      await sdk.api.abi.call({
        target: poolInfo[i].lpToken,
        abi: pairABI.find((m) => m.name === 'token1'),
        chain,
      })
    ).output;
    const token1Symbol = (
      await sdk.api.abi.call({
        target: token1Id,
        abi: pairABI.find((m) => m.name === 'symbol'),
        chain,
      })
    ).output;
    const token1Decimals = (
      await sdk.api.abi.call({
        target: token1Id,
        abi: pairABI.find((m) => m.name === 'decimals'),
        chain,
      })
    ).output;

    try {
      // lpToken variables
      const reserves = (
        await sdk.api.abi.call({
          target: poolInfo[i].lpToken,
          abi: pairABI.find((m) => m.name === 'getReserves'),
          block,
          chain,
        })
      ).output;
      const totalSupply = (
        await sdk.api.abi.call({
          target: poolInfo[i].lpToken,
          abi: pairABI.find((m) => m.name === 'totalSupply'),
          block,
          chain,
        })
      ).output;
      const totalDeposit = (
        await sdk.api.abi.call({
          target: poolInfo[i].lpToken,
          abi: pairABI.find((m) => m.name === 'balanceOf'),
          params: farm,
          block,
          chain,
        })
      ).output;

      // pool details
      poolDetails.push({
        id: poolInfo[i].lpToken,
        allocPoint: poolInfo[i].allocPoint,
        reserve0: reserves._reserve0 / (1 * 10 ** token0Decimals),
        reserve1: reserves._reserve1 / (1 * 10 ** token1Decimals),
        totalSupply: totalSupply,
        totalDeposit: totalDeposit,
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
      // default pool details
      poolDetails.push({
        id: poolInfo[i].lpToken,
        allocPoint: poolInfo[i].allocPoint,
        reserve0: 0,
        reserve1: 0,
        totalSupply: 0,
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

  return poolDetails;
};

const getData = async (target, block, hydtPrice) => {
  let targetABI;
  let abiParameter;

  if (target === earn) {
    targetABI = earnABI;
    abiParameter = 'HYGTPerSecond';
  } else {
    targetABI = farmABI;
    abiParameter = 'HYGTPerBlock';
  }

  const poolLength = (
    await sdk.api.abi.call({
      target,
      abi: targetABI.find((m) => m.name === 'poolLength'),
      chain,
    })
  ).output;

  let poolInfo = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolLength)).keys()].map((i) => ({
        target,
        params: i,
      })),
      abi: targetABI.find((m) => m.name === 'poolInfo'),
      chain,
    })
  ).output.map((o) => o.output);

  poolInfo = poolInfo.filter((i) => i.allocPoint > 0);

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target,
      abi: targetABI.find((m) => m.name === 'totalAllocPoint'),
      chain,
    })
  ).output;

  const hygtPer =
    (
      await sdk.api.abi.call({
        target,
        abi: targetABI.find((m) => m.name === abiParameter),
        chain,
      })
    ).output / 1e18;

  // getting hygt price
  const hygtPairInfo = await getFarmPoolInfo(block, hygtPair, chain);
  const hygtPrice =
    (parseFloat(hydtPrice) * hygtPairInfo[0].reserve1) /
    parseFloat(hygtPairInfo[0].reserve0);

  return [poolInfo, totalAllocPoint, hygtPer, hygtPrice];
};

const getEarnAPY = async (block, blockPrior, blockPrior7d, hydtPrice) => {
  const [poolInfo, totalAllocPoint, hygtPer, hygtPrice] = await getData(
    earn,
    block,
    hydtPrice
  );

  const secondsPerYear = 86400 * 365;
  const hygtPerYearUSD = hygtPer * secondsPerYear * hygtPrice;

  // pull data
  let data = await getEarnPoolInfo(block, poolInfo, chain);

  // pull data 24h offest
  let dataPrior = await getEarnPoolInfo(blockPrior, poolInfo, chain);

  // pull data 7d offest
  let dataPrior7d = await getEarnPoolInfo(blockPrior7d, poolInfo, chain);

  // calculate apy
  data = data.map((i) => utils.apy(i, dataPrior, dataPrior7d, 'v2'));

  const formattedChain = utils.formatChain(chain);
  const pool = `${hydt}-${formattedChain}`.toLowerCase();
  const symbol = 'HYDT';
  const rewardTokens = [hydt, hygt];
  const underlyingTokens = [hydt];
  const url = 'https://app.hydtprotocol.com/HYDT/earn';

  let apyTotal = 0;
  let tvlTotal = 0;
  let volumeUsd1dTotal = 0;
  let volumeUsd7dTotal = 0;

  data.forEach((p) => {
    const totalDeposit = new BigNumber(p.totalDeposit)
      .dividedBy(new BigNumber(10).pow(18))
      .toFixed(18);
    const tvlUSD = totalDeposit * hydtPrice;

    const apyBase =
      (((p.allocPoint / totalAllocPoint) * hygtPerYearUSD) / tvlUSD) * 100 +
      p.apy;

    apyTotal += apyBase;
    tvlTotal += tvlUSD;
    volumeUsd1dTotal += p?.volumeUsd1d || 0;
    volumeUsd7dTotal += p?.volumeUsd7d || 0;
  });

  apyTotal /= data.length;

  return [
    {
      pool,
      chain: formattedChain,
      project,
      symbol,
      url,
      tvlUsd: tvlTotal,
      apyBase: 0,
      apyBase7d: 0,
      apyReward: apyTotal || 0,
      rewardTokens,
      underlyingTokens,
      volumeUsd1d: volumeUsd1dTotal,
      volumeUsd7d: volumeUsd7dTotal,
    },
  ];
};

const getFarmAPY = async (block, blockPrior, blockPrior7d, hydtPrice) => {
  const [poolInfo, totalAllocPoint, hygtPer, hygtPrice] = await getData(
    farm,
    block,
    hydtPrice
  );

  const blocksPerYear = (86400 * 365) / 3;
  const hygtPerYearUSD = hygtPer * blocksPerYear * hygtPrice;

  // pull data
  let data = await getFarmPoolInfo(block, poolInfo, chain);

  // pull data 24h offest
  let dataPrior = await getFarmPoolInfo(blockPrior, poolInfo, chain);

  // pull data 7d offest
  let dataPrior7d = await getFarmPoolInfo(blockPrior7d, poolInfo, chain);

  // calculate tvl
  data = await utils.tvl(data, chain);

  data = data.map((i) => {
    const price0 =
      i.token0.id == hydt
        ? hydtPrice
        : i.token0.id == hygt
        ? hygtPrice
        : i.price0;
    const price1 =
      i.token1.id == hydt
        ? hydtPrice
        : i.token1.id == hygt
        ? hygtPrice
        : i.price1;
    const totalValueLockedUSD = price0 * i.reserve0 + price1 * i.reserve1;
    return {
      ...i,
      price0,
      price1,
      totalValueLockedUSD,
    };
  });

  // calculate apy
  data = data.map((i) => utils.apy(i, dataPrior, dataPrior7d, 'v2'));

  data = data.map((p) => {
    const formattedChain = utils.formatChain(chain);
    const pool = `${p.id}-${formattedChain}`.toLowerCase();
    const symbol =
      p.token0.symbol === 'HYDT'
        ? utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`)
        : p.token1.symbol === 'HYDT'
        ? utils.formatSymbol(`${p.token1.symbol}-${p.token0.symbol}`)
        : utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const rewardTokens = [hygt];
    const underlyingTokens = [p.id];
    const url = 'https://app.hydtprotocol.com/HYDT/farm';

    const totalDeposit = new BigNumber(p.totalDeposit)
      .dividedBy(new BigNumber(10).pow(18))
      .toFixed(18);
    const totalSupply = new BigNumber(p.totalSupply)
      .dividedBy(new BigNumber(10).pow(18))
      .toFixed(18);
    const ratio = totalDeposit / totalSupply || 1;
    const tvlUsd = p.totalValueLockedUSD * ratio;

    const rewardAPY =
      (((p.allocPoint / totalAllocPoint) * hygtPerYearUSD) / tvlUsd) * 100;

    return {
      pool,
      chain: formattedChain,
      project,
      symbol,
      url,
      tvlUsd,
      apyBase: 0,
      apyBase7d: 0,
      apyReward: rewardAPY || 0,
      rewardTokens,
      underlyingTokens,
      volumeUsd1d: p?.volumeUSD1d || 0,
      volumeUsd7d: p?.volumeUSD7d || 0,
    };
  });

  return data;
};

const getAPY = async () => {
  // getting all block variables
  const timestamp = Date.now() / 1000;
  const [block, blockPrior] = await utils.getBlocks(chain, timestamp, []);
  const [_, blockPrior7d] = await utils.getBlocks(chain, timestamp, [], 604800);

  // getting hydt price
  const hydtPrice = (
    await axios.get(`https://api.dexscreener.com/latest/dex/tokens/${hydt}`)
  ).data.pairs[0]?.priceUsd;

  let data = await getEarnAPY(block, blockPrior, blockPrior7d, hydtPrice);
  let farmData = await getFarmAPY(block, blockPrior, blockPrior7d, hydtPrice);

  farmData.forEach((i) => data.push(i));

  return data;
};

const main = async () => {
  let data = await getAPY();

  // process.exit(1)
  return data.filter((i) => utils.keepFinite(i));
};

module.exports = {
  timetravel: false,
  apy: main,
};
