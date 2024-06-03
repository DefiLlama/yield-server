const axios = require('axios');
const utils = require('../utils');
const BigNumber = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { ethABI, polygonABI } = require('./abis');
const API_URL = 'https://api.zcx.com/private/apr/current';
const ZCX = '0xc52c326331e9ce41f04484d3b5e5648158028804';
const polygonStakingAddr = '0x078f188810ad3F2506a4FD76a982F281f4df15F2';

async function getTvl() {
    const totalStakedETH = (
      await sdk.api.abi.call({
        abi: ethABI.find((a) => a.name === 'getTVLs'),
        chain: 'ethereum',
        target: '0x57A34b17F859D92B7D5aAf03748C7A280cFbE521',
        params: [],
      })
    ).output[0];

    const totalStakedPolygon = (
        await sdk.api.abi.call({
          abi: polygonABI.find((a) => a.name === 'totalSupply'),
          chain: 'polygon',
          target: '0x078f188810ad3F2506a4FD76a982F281f4df15F2',
          params: [],
        })
      ).output;
    const tvlETH = new BigNumber(totalStakedETH);
    const tvlPolygon = new BigNumber(totalStakedPolygon);
    const tvl = tvlETH.plus(tvlPolygon);
    return tvl;
  }


  
const getApy = async () => {
    const data = await utils.getData(API_URL);
    const tvl = await getTvl();
    const price = (await utils.getPrices([ZCX], 'ethereum')).pricesByAddress;
    const poolInfos = data.items;
    let rewardTokens = []
    poolInfos.filter(e => e.totalApr !== '0').map((item) => {
        rewardTokens.push(item.token)
    });
    return [{
          pool: polygonStakingAddr,
          chain: utils.formatChain('polygon'),
          project: 'unizen',
          symbol: 'ZCX',
          tvlUsd: Number(tvl) * price[ZCX] / 1e18,
          apyReward: data.apr,
          rewardTokens: rewardTokens
    }]
}

module.exports = {
  apy: getApy,
  url: 'https://zcx.com/earn',
};
