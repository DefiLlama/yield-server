const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const STAKING_CONTRACT = '0x1adB950d8bB3dA4bE104211D5AB038628e477fE6';
const SLISBNB = '0xB0b84D294e0C75A6abe60171b70edEb2EFd14A1B';
const BNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';

// The rate moves in discrete steps, so a 7d window reads anywhere from 0.4% to 1.1%
// annualised while 30d and 90d both settle near 0.58%.
const WINDOW_DAYS = 30;
const DAY_SECONDS = 86400;
const ONE_BNB = '1000000000000000000';

const abi = {
  getTotalPooledBnb: {
    inputs: [],
    name: 'getTotalPooledBnb',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  convertSnBnbToBnb:
    'function convertSnBnbToBnb(uint256 amount) view returns (uint256)',
};

const bnbPerSlisBnbAt = async (block) => {
  const { output } = await sdk.api.abi.call({
    chain: 'bsc',
    target: STAKING_CONTRACT,
    abi: abi.convertSnBnbToBnb,
    params: [ONE_BNB],
    block,
  });
  return Number(output);
};

const exchangeRateApy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const then = now - WINDOW_DAYS * DAY_SECONDS;

  const [blockNow, blockThen] = await Promise.all([
    utils.getPriceApiData(`/block/bsc/${now}`),
    utils.getPriceApiData(`/block/bsc/${then}`),
  ]);

  const [rateNow, rateThen] = await Promise.all([
    bnbPerSlisBnbAt(blockNow.height),
    bnbPerSlisBnbAt(blockThen.height),
  ]);

  const ratio = rateNow / rateThen;
  // slisBNB is non-rebasing and its rate only accrues, so a ratio below 1 means the
  // window is bad rather than that holders lost BNB.
  if (!(ratio >= 1)) return null;

  return (ratio ** (365 / WINDOW_DAYS) - 1) * 100;
};

const apy = async () => {
  const [totalPooledBnb, bnbPrice, apyBase] = await Promise.all([
    sdk.api.abi.call({
      target: STAKING_CONTRACT,
      abi: abi.getTotalPooledBnb,
      chain: 'bsc',
    }),
    axios.get(
      utils.getPriceApiUrl(
        '/prices/current/bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'
      )
    ),
    exchangeRateApy(),
  ]);

  if (apyBase === null) {
    throw new Error(
      `lista-liquid-staking: could not read the ${WINDOW_DAYS}d slisBNB exchange rate`
    );
  }

  const tvlUsd =
    (totalPooledBnb.output / 1e18) *
    bnbPrice.data.coins['bsc:0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c'].price;

  return [
    {
      pool: SLISBNB,
      chain: 'bsc',
      project: 'lista-liquid-staking',
      symbol: 'slisBNB',
      tvlUsd,
      apyBase,
      underlyingTokens: [SLISBNB],
      url: 'https://lista.org/liquid-staking/BNB',
    },
  ];
};

module.exports = {
  protocolId: '3354',
  apy,
  url: 'https://lista.org/liquid-staking/BNB',
};
