const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

const chains = {
  op_bnb: {
    kUSDT: '0x1Bc6F42D6D1680115A52F82DFA29265085E91d93',
    apyEndpoint: 'https://opapi.kiloex.io/common/queryKiloNewVaultApyHistory',
    htokens:'https://opapi.kiloex.io/vault/hTokens'
  },
  manta: {
    kUSDT: '0xa10f74374b8bE9E9C8Fb62c1Dc17B8D4247E332A',
    apyEndpoint: 'https://mantaapi.kiloex.io/common/queryKiloNewVaultApyHistory',
    STONE: '0xEc901DA9c68E90798BbBb74c11406A32A70652C3',
    htokens:'https://mantaapi.kiloex.io/vault/hTokens'
  },
  bsc: {
    kUSDT: '0xef7aF0804AAB3885da59a8236fabfA19DDc6Cf48',
    apyEndpoint: 'https://api.kiloex.io/common/queryKiloNewVaultApyHistory',
    htokens:'https://api.kiloex.io/vault/hTokens'
  },
  taiko: {
    kUSDT: '0x2646E743A8F47b8d2427dBcc10f89e911f2dBBaa',
    apyEndpoint: 'https://taikoapi.kiloex.io/common/queryKiloNewVaultApyHistory',
    htokens:'https://taikoapi.kiloex.io/vault/hTokens'
  },
  bsquared: {
    kUSDT: '0xB20Faa4BA0DdEbDe49299557f4F1ebB5532745e3',
    apyEndpoint: 'https://b2api.kiloex.io/common/queryKiloNewVaultApyHistory',
    htokens:'https://b2api.kiloex.io/vault/hTokens'
  }
};

const getApy = async () => {
  const pools = await Promise.all(
    Object.keys(chains).map(async (chain) => {
      const y = chains[chain];
      let results = [];

      const hTokensData = (await axios.get(y.htokens)).data.data;
      const apr = hTokensData.apy
      for (const key in hTokensData.tokens) {
        try {
            const token = hTokensData.tokens[key];
            const balance =
              (
                await sdk.api.abi.call({
                  target: token.originToken,
                  abi: 'erc20:balanceOf',
                  params: [y.kUSDT],
                  chain,
                })
              ).output / token.tokenPrecision;
    
            results.push({
              chain,
              project: 'kiloex',
              pool: token.originToken,
              symbol: token.tokenName,
              tvlUsd: balance * token.price,
              apyBase: parseFloat((apr * 100 * token.ltv /10000).toFixed(2)),
              underlyingTokens: [token.originToken],
            });
        } catch(e) {
          //skip error
        }
        
      }
      // if (chain === 'manta') {
      //   const stoneBalance =
      //     (
      //       await sdk.api.abi.call({
      //         target: y.STONE,
      //         abi: 'erc20:balanceOf',
      //         params: ['0x471C5e8Cc0fEC9aeeb7ABA6697105fD6aaaDFf99'],
      //         chain,
      //       })
      //     ).output / 1e18;
      //
      //   const priceKey = `manta:${y.STONE}`;
      //   const price = (
      //     await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
      //   ).data.coins[priceKey].price;
      //
      //   const stoneApy = (await axios.get('https://mantaapi.kiloex.io/sidevault/info')).data.data.apy;
      //
      //   results.push({
      //     chain,
      //     project: 'kiloex',
      //     pool: y.STONE,
      //     symbol: 'STONE',
      //     tvlUsd: stoneBalance * price,
      //     apyBase: Number(stoneApy) * 100,
      //     underlyingTokens: [y.STONE],
      //   });
      // }
      return results;
    })
  );

  return pools.flat();
};

module.exports = {
  apy: getApy,
  url: 'https://app.kiloex.io/trade/vault',
};
