const utils = require('../utils');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const staking = '0xe742FCE58484FF7be7835D95E350c23CE55A7E12';
const minto = '0x410a56541bd912f9b60943fcb344f1e3d6f09567';

const poolsFunction = async () => {
  const apyData = await utils.getData(
    'https://bsc-prod.minto.org/v1/stats/rewards'
  );
  const totalStaked =
    (
      await sdk.api.abi.call({
        target: staking,
        abi: {
          inputs: [],
          name: 'totalStake',
          outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
          stateMutability: 'view',
          type: 'function',
        },
        chain: 'bsc',
      })
    ).output / 1e18;

  const priceKey = `bsc:${minto}`;
  const price = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;

  const pool = {
    pool: staking,
    chain: utils.formatChain('binance'),
    project: 'minto',
    symbol: utils.formatSymbol('staking'),
    tvlUsd: totalStaked * price,
    apy: apyData.apy['365'],
  };

  return [pool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://minto.finance/staking',
};
