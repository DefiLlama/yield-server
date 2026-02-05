const superagent = require('superagent');
const { mapKeys, camelCase } = require('lodash');

const utils = require('../utils');

// Token addresses by chain
const tokenAddresses = {
  binance: {
    WING: '0x3CB7378565718c64Ab86970802140Cc48eF1f969',
    ONT: '0xFd7B3A77848f1C2D67E05E54d78d174a0C850335',
    ONG: '0x308bfaeAaC8BDab6e9Fc5Ead8EdCb5f95b0599d9',
    BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
    ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    BNB: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c',
    DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
  },
  ethereum: {
    WING: '0xDb0f18081b505A7DE20B18ac41856BCB4Ba86A1a',
    ETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    WBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599',
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EeadCfC6E03e6B5',
  },
  ontology: {}, // Ontology native - no EVM addresses
  ontologyEvm: {
    WING: '0x004835c1Df02F9128b6d88dEb52E808eb2B2714e',
    ONT: '0xEBA8B0C65beEf1B86f1e153B16d4B00A7317FA4B',
    ONG: '0x4eE8BC3F57F68a05dB8f0E0a95a6c4f60b587A6C',
  },
};

const API_URL = {
  ontology: 'https://flashapi.wing.finance/api/v1/userflashpooloverview',
  binance: 'https://ethapi.wing.finance/bsc/flash-pool/overview',
  ontologyEvm: 'https://ethapi.wing.finance/ontevm/flash-pool/overview',
  ethereum: 'https://ethapi.wing.finance/eth/flash-pool/overview',
};

const apy = async () => {
  const data = await Promise.all(
    Object.entries(API_URL).map(async ([chain, url]) => [
      chain,
      (await superagent.post(url).send({ address: '' })).body.result,
    ])
  );

  const normalizedData = data.map(([chain, data]) => [
    chain,
    chain === 'ontology'
      ? data.UserFlashPoolOverview.AllMarket
      : data.allMarket,
  ]);

  const pools = normalizedData.map(([chain, chainPools]) => {
    return chainPools
      .map((pool) => mapKeys(pool, (v, k) => camelCase(k)))
      .map((pool) => {
        // Get underlying token address
        const chainTokens = tokenAddresses[chain] || {};
        const underlyingToken = chainTokens[pool.name];

        return {
          pool: `${pool.name}-wing-finance-${chain}`,
          chain: chain === 'ontologyEvm' ? 'ontology' : chain,
          project: 'wing-finance',
          symbol: pool.name,
          tvlUsd:
            Number(pool.totalSupplyDollar) -
            Number(pool.totalValidBorrowDollar),
          apyBase: Number(pool.supplyApy) * 100,
          apyReward:
            (Number(pool.annualSupplyWingDistributedDollar) /
              Number(pool.totalSupplyDollar)) *
            100,
          rewardTokens: ['0xDb0f18081b505A7DE20B18ac41856BCB4Ba86A1a'],
          // borrow fields
          totalSupplyUsd: Number(pool.totalSupplyDollar),
          totalBorrowUsd: Number(pool.totalValidBorrowDollar),
          apyBaseBorrow: Number(pool.borrowApy) * 100,
          apyRewardBorrow:
            (Number(pool.annualBorrowWingDistributedDollar) /
              Number(pool.totalValidBorrowDollar)) *
            100,
          ltv: Number(pool.collateralFactor),
          underlyingTokens: underlyingToken ? [underlyingToken] : undefined,
        };
      });
  });

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://flash.wing.finance/',
};
