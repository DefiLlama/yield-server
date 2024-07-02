//TODO: remove abi.js if nothing else is needed from there
//TODO: check the apy calculation, also it could be declared only as APY instead of apyBase as per the readme
//TODO: not sure if we needed the total amount of stakers for anything for the DefiLlama.. got to sleep and re-read

const superagent = require('superagent');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

const SAVAX_ADDRESS = '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE';
const AVAX_ADDRESS = '0xb31f66aa3c1e785363f0875a1b74e27b85fd66c7';

const abi = {
  stakerCount: {"inputs":[],"name":"stakerCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  totalPooledAvax: {"inputs":[],"name":"totalPooledAvax","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},
  totalSupply: {"inputs":[],"name":"totalSupply","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}
};

const getPrices = async (addresses) => {
  const prices = (
    await superagent.get(
      `https://coins.llama.fi/prices/current/${addresses
        .join(',')
        .toLowerCase()}`
    )
  ).body.coins;

  const pricesByAddress = Object.entries(prices).reduce(
    (acc, [name, price]) => ({
      ...acc,
      [name.split(':')[1]]: price.price,
    }),
    {}
  );

  return pricesByAddress;
};

const getApy = async () => {
  const [stakerCount, totalPooledAvax, totalSupply] = await Promise.all([
    sdk.api.abi.call({
      target: SAVAX_ADDRESS,
      chain: 'avax',
      abi: abi.stakerCount,
    }),
    sdk.api.abi.call({
      target: SAVAX_ADDRESS,
      chain: 'avax',
      abi: abi.totalPooledAvax,
    }),
    sdk.api.abi.call({
      target: SAVAX_ADDRESS,
      chain: 'avax',
      abi: abi.totalSupply,
    }),
  ]);

  const prices = await getPrices([`avax:${AVAX_ADDRESS}`]);
  const avaxPrice = prices[AVAX_ADDRESS.toLowerCase()];

  const totalPooledAvaxUsd = (totalPooledAvax.output / 1e18) * avaxPrice;
  const totalSupplyUsd = (totalSupply.output / 1e18) * avaxPrice;

  const sAvaxPrice = totalPooledAvaxUsd / (totalSupply.output / 1e18);

  return [{
    pool: SAVAX_ADDRESS,
    chain: utils.formatChain('avalanche'),
    project: 'benqi-staked-avax',
    symbol: 'sAVAX',
    tvlUsd: totalPooledAvaxUsd,
    apyBase: Number(((sAvaxPrice / avaxPrice - 1) * 365 *100).toFixed(2)),
    underlyingTokens: [AVAX_ADDRESS],
  }];
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://staking.benqi.fi/stake',
};
