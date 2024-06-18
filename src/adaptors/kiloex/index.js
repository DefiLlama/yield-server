const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const chains = {
  op_bnb: {
    USDT: '0x9e5aac1ba1a2e6aed6b32689dfcf62a509ca96f3',
    decimals: 18,
    kUSDT: '0xA2E2F3726DF754C1848C8fd1CbeA6aAFF84FC5B2',
    apyEndpoint: 'https://opapi.kiloex.io/common/queryKiloNewVaultApyHistory'
  },
  manta: {
    USDT: '0xf417F5A458eC102B90352F697D6e2Ac3A3d2851f',
    decimals: 6,
    kUSDT: '0xA2E2F3726DF754C1848C8fd1CbeA6aAFF84FC5B2',
    apyEndpoint: 'https://mantaapi.kiloex.io/common/queryKiloNewVaultApyHistory',
    STONE: '0xEc901DA9c68E90798BbBb74c11406A32A70652C3'
  },
  bsc: {
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    decimals: 18,
    kUSDT: '0x1c3f35F7883fc4Ea8C4BCA1507144DC6087ad0fb',
    apyEndpoint: 'https://api.kiloex.io/common/queryKiloNewVaultApyHistory'
  },
  taiko: {
    USDT: '0x07d83526730c7438048D55A4fc0b850e2aaB6f0b',
    decimals: 6,
    kUSDT: '0x735D00A9368164B9dcB2e008d5Cd15b367649aD5',
    apyEndpoint: 'https://taikoapi.kiloex.io/common/queryKiloNewVaultApyHistory'
  }
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const y = chains[chain];
      const aprArray = (await axios.get(y.apyEndpoint)).data;
      const apr = aprArray[aprArray.length - 1];

      const balance =
        (
          await sdk.api.abi.call({
            target: y.USDT,
            abi: 'erc20:balanceOf',
            params: [y.kUSDT],
            chain,
          })
        ).output / 10**y.decimals;


      let results = []
      results.push({
        chain,
        project: 'kiloex',
        pool: y.USDT,
        symbol: chain === 'taiko' ? 'USDC' : 'USDT',
        tvlUsd: balance,
        apyBase: apr.apy * 100,
        underlyingTokens: [y.USDT],
      });
      if (chain === 'manta') {
        const stoneBalance =
          (
            await sdk.api.abi.call({
              target: y.STONE,
              abi: 'erc20:balanceOf',
              params: ['0x471C5e8Cc0fEC9aeeb7ABA6697105fD6aaaDFf99'],
              chain,
            })
          ).output / 1e18;

        const priceKey = `manta:${y.STONE}`;
        const price = (
          await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
        ).data.coins[priceKey].price;

        const stoneApy = (await axios.get('https://mantaapi.kiloex.io/sidevault/info')).data.data.apy;

        results.push({
          chain,
          project: 'kiloex',
          pool: y.STONE,
          symbol: 'STONE',
          tvlUsd: stoneBalance * price,
          apyBase: Number(stoneApy) * 100,
          underlyingTokens: [y.STONE],
        });
      }
      return results;
    })
  );

  return pools.flat();
};

module.exports = {
  apy: getApy,
  url: 'https://app.kiloex.io/trade/vault',
};
