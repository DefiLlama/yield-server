const axios = require('axios');
const web3 = require('web3');
const utils = require('../utils');
const { request, gql } = require('graphql-request');
const { apy: gmxApy } = require('../gmx/index.js');

const USDC = '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e';
const BTCB = '0x152b9d0FdC40C096757F570A51E494bd4b943E50';
const fsGLP = '0x9e295B5B976a184B14aD8cd72413aD846C299660';

const tokens = {
  [USDC]: {
    project: 'struct-finance',
    symbol: 'USDC',
    chain: utils.formatChain('avax'),
    underlyingTokens: [fsGLP],
  },
  [BTCB]: {
    project: 'struct-finance',
    symbol: 'BTC.b',
    chain: utils.formatChain('avax'),
    underlyingTokens: [fsGLP],
  },
};

// percentages are scaled by 10 ** 4
const scalingFactor = 10 ** 4;

// returns tranches sorted by the highest hurdle (senior) rate available for a given token
const qGetHighestSeniorRateForOpenTrancheToken = gql`
  query GetHighestSeniorRateForOpenTrancheToken($tokenAddress: Bytes) {
    trancheCreateds(
      orderDirection: desc
      orderBy: product__hurdleRate
      where: {
        and: [
          { trancheType: "0" }
          { tokenAddress: $tokenAddress }
          { product_: { status: 0 } }
        ]
      }
    ) {
      id
      trancheType
      tokenAddress
      product {
        id
        hurdleRate
        tranches {
          senior {
            totalDeposited
          }
        }
      }
    }
  }
`;

// returns tranches sorted by the highest junior rate (lowest hurdle rate) available for a given token
const qGetHighestJuniorRateForOpenTrancheToken = gql`
  query GetHighestJuniorRateForOpenTrancheToken($tokenAddress: Bytes) {
    trancheCreateds(
      orderDirection: asc
      orderBy: product__hurdleRate
      where: {
        and: [
          { trancheType: "1" }
          { tokenAddress: $tokenAddress }
          { product_: { status: 0 } }
        ]
      }
    ) {
      id
      trancheType
      tokenAddress
      product {
        id
        hurdleRate
        tranches {
          junior {
            totalDeposited
          }
        }
      }
    }
  }
`;

async function getTrancheTokenInfo(tokenAddress, glpApy, tokenInfo) {
  const { trancheCreateds: seniorTranches } = await request(
    'https://subgraph.satsuma-prod.com/0598bbca8a6d/structfinance/struct-finance-factory/api',
    qGetHighestSeniorRateForOpenTrancheToken,
    {
      tokenAddress,
    }
  );

  const { trancheCreateds: juniorTranches } = await request(
    'https://subgraph.satsuma-prod.com/0598bbca8a6d/structfinance/struct-finance-factory/api',
    qGetHighestJuniorRateForOpenTrancheToken,
    {
      tokenAddress,
    }
  );

  let tokenDeposits = 0;
  let highestJuniorRate = 0;
  let highestSeniorRate = 0;
  if (seniorTranches.length !== 0) {
    highestSeniorRate = Number(seniorTranches[0].product.hurdleRate);
    tokenDeposits += seniorTranches.reduce(tabulateTokenDeposits, 0);
  }
  if (juniorTranches.length !== 0) {
    // junior tranche rate is 2x the glp rate minus the senior tranche rate
    highestJuniorRate =
      glpApy * 2 - Number(juniorTranches[0].product.hurdleRate);
    tokenDeposits += juniorTranches.reduce(tabulateTokenDeposits, 0);
  }

  let highestApr = 0;
  let pool;
  if (highestSeniorRate > highestJuniorRate) {
    highestApr = highestSeniorRate;
    pool = `${seniorTranches[0].product.id}-avax`.toLowerCase();
  } else {
    highestApr = highestJuniorRate;
    pool = `${juniorTranches[0].product.id}-avax`.toLowerCase();
  }

  const highestAprHuman = highestApr / scalingFactor;
  const tokenDepositsHuman = tokenDeposits / 10 ** tokenInfo.decimals;
  const tvlUsd = tokenDepositsHuman * tokenInfo.price;

  const tokenData = tokens[tokenAddress];
  Object.assign(tokenData, {
    apy: highestAprHuman,
    pool: tokenAddress,
    tvlUsd,
  });
  return tokenData;
}

function tabulateTokenDeposits(acc, tranche) {
  return (
    acc + Number(Object.values(tranche.product.tranches)[0].totalDeposited)
  );
}

async function getTokenPrices() {
  const priceKeys = Object.keys(tokens)
    .map((i) => `avax:${i}`)
    .join(',');

  return (await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`))
    .data.coins;
}

async function getTrancheTokenAprs() {
    console.log("!!!!!!!!")
  const [, , , glpAvax] = await gmxApy();
  console.log("file: index.js:160 ~ getTrancheTokenAprs ~ glpAvax:", glpAvax);
  const tokenPrices = await getTokenPrices();
  const glpApyBaseScaled = Math.floor(glpAvax.apyBase * scalingFactor);
  const trancheTokenPromises = Object.entries(tokens).map(async ([tokenAddress, token]) => {
    const tokenInfo = tokenPrices[`avax:${tokenAddress}`];
    return getTrancheTokenInfo(tokenAddress, glpApyBaseScaled, tokenInfo);
  });
  const tokenAprs = await Promise.all(trancheTokenPromises);
  return tokenAprs;
}

module.exports = {
  timetravel: false,
  apy: getTrancheTokenAprs,
  url: 'https://app.struct.fi/markets',
};
