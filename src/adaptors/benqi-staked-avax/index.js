const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SAVAX_ADDRESS = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';
const AVAX_ADDRESS = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';

const abi = {
  totalPooledAvax: {"inputs":[],"name":"totalPooledAvax","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
};

const getAvaxPrice = async () => {
  const pricesResponse = await superagent.get(
    `https://coins.llama.fi/prices/current/avax:${AVAX_ADDRESS.toLowerCase()}`
  );
  return pricesResponse.body.coins[`avax:${AVAX_ADDRESS.toLowerCase()}`].price;
};

const fetchTotalPooledAvax = async () => {
  const { output } = await sdk.api.abi.call({
    target: SAVAX_ADDRESS,
    chain: 'avax',
    abi: abi.totalPooledAvax,
  });
  return output;
};

const fetchStakingApr = async () => {
  const aprResponse = await superagent.get('https://api.benqi.fi/liquidstaking/apr');
  return Number(aprResponse.body.apr);
};

const calculateTvl = (totalPooledAvax, avaxPrice) => {
  return (totalPooledAvax / 1e18) * avaxPrice;
};

const main = async () => {
  try {
    const [totalPooledAvax, avaxPrice, stakingApr] = await Promise.all([
      fetchTotalPooledAvax(),
      getAvaxPrice(),
      fetchStakingApr(),
    ]);

    const tvlUsd = calculateTvl(totalPooledAvax, avaxPrice);

    return [{
      pool: SAVAX_ADDRESS,
      chain: utils.formatChain('avalanche'),
      project: 'benqi-staked-avax',
      symbol: 'sAVAX',
      tvlUsd,
      apyBase: stakingApr,
      underlyingTokens: [AVAX_ADDRESS],
    }];
  } catch (error) {
    console.error('Error fetching data:', error.message);
    throw new Error(`Failed to fetch data: ${error.message}`);
  }
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://staking.benqi.fi/stake',
};
