const superagent = require('superagent');

const utils = require('../utils');
const pools = require('./pools.json');
const sdk = require('@defillama/sdk');
const abi = require('./abi.json');

const url = 'https://newapi4.radiant.capital/42161.json';

const sleep = async (ms) => {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
};

const apy = async (pools, dataTvl) => {
  const maxCallsPerSec = 5;
  const data = [];
  for (const [i, pool] of pools.entries()) {
    const interest = dataTvl.find(
      (el) => el.tokenAddress === pool.interestBearing
    );
    const debt = dataTvl.find((el) => el.tokenAddress === pool.debtBearing);
    const output = (
      await sdk.api.abi.call({
        target: '0x2032b9A8e9F7e76768CA9271003d3e43E1616B1F',
        abi: abi.find((a) => a.name === 'getReserveData'),
        chain: 'arbitrum',
        params: [pool.underlyingAsset],
      })
    ).output;

    const liquidity = (
      await sdk.api.abi.call({
        target: pool.underlyingAsset,
        abi: 'erc20:balanceOf',
        chain: 'arbitrum',
        params: [pool.interestBearing],
      })
    ).output;

    const decimals = +(
      await sdk.api.abi.call({
        target: pool.underlyingAsset,
        abi: 'erc20:decimals',
        chain: 'arbitrum',
      })
    ).output;

    const depositApy = output.currentLiquidityRate / 1e25;
    if ((i + 1) % maxCallsPerSec === 0) {
      await sleep(1000);
    }

    const borrowApy = output.currentVariableBorrowRate / 1e25;
    if ((i + 1) % maxCallsPerSec === 0) {
      await sleep(1000);
    }

    const tvlUsd = (liquidity / 10 ** decimals) * interest.assetPrice;
    const totalSupplyUsd = interest.poolValue * interest.assetPrice;
    const totalBorrowUsd = totalSupplyUsd - tvlUsd;

    data.push({
      ...pool,
      id: interest.tokenAddress,
      symbol: pool.symbol,
      tvlUsd,
      depositApy,
      borrowApy,
      rewardApy: interest.apy * 100,
      rewardApyBorrow: debt.apy * 100,
      totalSupplyUsd,
      totalBorrowUsd,
    });
  }
  return data;
};

const apyPool2 = async (pool2Info) => {
  const pool2 = '0xc963ef7d977ECb0Ab71d835C4cb1Bf737f28d010';

  return {
    address: pool2,
    id: pool2,
    symbol: 'RDNT-ETH',
    underlyingAsset: '0x0c4681e6c0235179ec3d4f4fc4df3d14fdd96017',
    tvlUsd: pool2Info.data.totalLpStakedUSD,
    rewardApy: pool2Info.data.apr * 100,
  };
};

const padHex = (hexstring, intSize = 256) => {
  hexstring = hexstring.replace('0x', '');
  const length = intSize / 4 - hexstring.length;
  for (let i = 0; i < length; i++) {
    hexstring = '0' + hexstring;
  }
  return hexstring;
};

const topLvl = async (chainString, url) => {
  const dataTvl = await utils.getData(url);

  let data = await apy(pools, dataTvl.lendingPoolRewards.data.poolAPRs);
  let pool2Data = await apyPool2(dataTvl.pool2Info);
  data.push(pool2Data);

  return data.map((p) => {
    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'radiant',
      symbol: utils.formatSymbol(p.symbol),
      tvlUsd: p.tvlUsd,
      apyBase: p.depositApy,
      apyReward: p.rewardApy,
      underlyingTokens: [p.underlyingAsset],
      rewardTokens: [
        '0x0c4681e6c0235179ec3d4f4fc4df3d14fdd96017', // RNDT
      ],
      // borrow fields
      apyBaseBorrow: p.borrowApy,
      apyRewardBorrow: p.rewardApyBorrow,
      totalSupplyUsd: p.totalSupplyUsd,
      totalBorrowUsd: p.totalBorrowUsd,
    };
  });
};

const main = async () => {
  const data = await Promise.all([topLvl('arbitrum', url)]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.radiant.capital/#/markets',
};
