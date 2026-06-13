const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SAVAX_ADDRESS = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';
const AVAX_ADDRESS = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';

const abi = {
  totalPooledAvax: {
    inputs: [],
    name: 'totalPooledAvax',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  getPooledAvaxByShares: {
    inputs: [{ internalType: 'uint256', name: 'shareAmount', type: 'uint256' }],
    name: 'getPooledAvaxByShares',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const ONE_E18 = '1000000000000000000';

const main = async () => {
  const now = Math.floor(Date.now() / 1000);
  const timestamp1dAgo = now - 86400;
  const timestamp7dAgo = now - 86400 * 7;

  const [totalPooledAvax, block1dAgo, block7dAgo] = await Promise.all([
    sdk.api.abi.call({
      target: SAVAX_ADDRESS,
      chain: 'avax',
      abi: abi.totalPooledAvax,
    }),
    axios
      .get(`https://coins.llama.fi/block/avax/${timestamp1dAgo}`)
      .then((r) => r.data.height),
    axios
      .get(`https://coins.llama.fi/block/avax/${timestamp7dAgo}`)
      .then((r) => r.data.height),
  ]);

  const [rateNow, rate1dAgo, rate7dAgo] = await Promise.all([
    sdk.api.abi.call({
      target: SAVAX_ADDRESS,
      abi: abi.getPooledAvaxByShares,
      params: [ONE_E18],
      chain: 'avax',
    }),
    sdk.api.abi.call({
      target: SAVAX_ADDRESS,
      abi: abi.getPooledAvaxByShares,
      params: [ONE_E18],
      chain: 'avax',
      block: block1dAgo,
    }),
    sdk.api.abi.call({
      target: SAVAX_ADDRESS,
      abi: abi.getPooledAvaxByShares,
      params: [ONE_E18],
      chain: 'avax',
      block: block7dAgo,
    }),
  ]);

  const apyBase =
    rate1dAgo.output > 0
      ? ((rateNow.output / rate1dAgo.output) ** 365 - 1) * 100
      : 0;
  const apyBase7d =
    rate7dAgo.output > 0
      ? ((rateNow.output / rate7dAgo.output) ** (365 / 7) - 1) * 100
      : 0;

  const priceKey = `avax:${AVAX_ADDRESS}`;
  const avaxPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const tvlUsd = (totalPooledAvax.output / 1e18) * avaxPrice;

  return [
    {
      pool: SAVAX_ADDRESS,
      chain: utils.formatChain('avalanche'),
      project: 'benqi-staked-avax',
      symbol: 'sAVAX',
      tvlUsd,
      apyBase,
      apyBase7d,
      ...(Number(rateNow.output) / 1e18 > 0 && { pricePerShare: Number(rateNow.output) / 1e18 }),
      underlyingTokens: [AVAX_ADDRESS],
      searchTokenOverride: SAVAX_ADDRESS,
      poolMeta: 'Unstaking Cooldown: 15days',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://staking.benqi.fi/stake',
};
