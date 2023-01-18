const sdk = require('@defillama/sdk');
const axios = require('axios');
const abi = require('./abi.js');
const rethAbi = require('./rethAbi.js');

const rocketMinipoolManager = '0x6293B8abC1F36aFB22406Be5f96D893072A8cF3a';
const rocketVault = '0x3bDC69C4E5e13E52A65f5583c23EFB9636b469d6';
const weth = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const token = '0xae78736cd615f374d3085123a210448e74fc6393'; //reth

// mostly copy pasta from tvl adapter
const getApy = async () => {
  // Get ETH staked for rETH, which is given by users and Node Operators
  // Get minipool count per status
  let offset = 0;
  const limit = 400,
    statusesCount = 5;
  let minipool_count_per_status = new Array(statusesCount).fill(0);

  while (true) {
    const { output: activeMinipoolCount } = await sdk.api.abi.call({
      target: rocketMinipoolManager,
      params: [offset, limit],
      abi: abi.find((m) => m.name === 'getMinipoolCountPerStatus'),
      chain: 'ethereum',
    });

    const activeMinipoolCount_arr = [...Array(statusesCount).keys()].map(
      (i) => activeMinipoolCount[i.toString()]
    );
    minipool_count_per_status = minipool_count_per_status.map(
      (sum, idx) => sum + parseInt(activeMinipoolCount[idx])
    );
    if (activeMinipoolCount_arr.reduce((a, b) => a + parseInt(b), 0) < limit) {
      break;
    }
    offset += limit;
  }

  // Get ETH balance of multiple rocketpool contracts as well as RPL staked
  const [
    { output: rocketDepositPoolBalance },
    { output: rocketTokenRETHBalance },
  ] = await Promise.all([
    sdk.api.abi.call({
      target: rocketVault,
      params: ['rocketDepositPool'],
      abi: abi.find((m) => m.name === 'balanceOf'),
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: rocketVault,
      params: ['rocketTokenRETH'],
      abi: abi.find((m) => m.name === 'balanceOf'),
      chain: 'ethereum',
    }),
  ]);

  // ETH staked in Rocketpool pools
  const unmatched_minipools = minipool_count_per_status[0] * 16; // Unmatched minipools
  const pending_minipools = minipool_count_per_status[1] * 32; // Pending minipools (matched but not staking yet)
  const staking_minipools = minipool_count_per_status[2] * 32; // Staking minipools
  const withdrawable_minipools = minipool_count_per_status[3] * 32; // Withdrawable minipools

  const ETH_TVL =
    staking_minipools +
    pending_minipools +
    unmatched_minipools +
    withdrawable_minipools +
    parseFloat(rocketDepositPoolBalance) / 1e18 +
    parseFloat(rocketTokenRETHBalance) / 1e18;

  const timestamp1dayAgo = Math.floor(Date.now() / 1000) - 86400;
  const duration = 1; // day
  const block1dayAgo = (
    await axios.get(`https://coins.llama.fi/block/ethereum/${timestamp1dayAgo}`)
  ).data.height;

  const exchangeRates = await Promise.all([
    sdk.api.abi.call({
      target: token,
      abi: rethAbi.find((m) => m.name === 'getExchangeRate'),
      chain: 'ethereum',
    }),
    sdk.api.abi.call({
      target: token,
      abi: rethAbi.find((m) => m.name === 'getExchangeRate'),
      chain: 'ethereum',
      block: block1dayAgo,
    }),
  ]);

  const apr =
    ((exchangeRates[0].output - exchangeRates[1].output) / 1e18 / duration) *
    365 *
    100;

  const priceKey = `ethereum:${weth}`;
  const ethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  return [
    {
      pool: token,
      chain: 'ethereum',
      project: 'rocket-pool',
      symbol: 'rETH',
      tvlUsd: ETH_TVL * ethPrice,
      apyBase: apr,
      underlyingTokens: [weth],
    },
  ];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://stake.rocketpool.net/',
};
