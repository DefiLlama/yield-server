const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const GARDEN_STAKING_CONTRACT = '0xe2239938Ce088148b3Ab398b2b77Eedfcd9d1AfC'
const SEED_TOKEN = '0x86f65121804D2Cdbef79F9f072D4e0c2eEbABC08'
const chain = 'arbitrum'


const getTvl = async () => {

  try {

    const apyData = await utils.getData(
      'https://stakingv2.garden.finance/apy'
    );

    const balance = await sdk.api.abi.call({
      target: SEED_TOKEN,
      abi: 'erc20:balanceOf',
      params: [GARDEN_STAKING_CONTRACT],
      chain: chain,
    })


    // Get SEED token decimals
    const decimals = await sdk.api.abi.call({
      target: SEED_TOKEN,
      abi: 'erc20:decimals',
      chain: chain,
    });

    // Get SEED price
    const priceData = await axios.get(
      'https://coins.llama.fi/prices/current/arbitrum:0x86f65121804D2Cdbef79F9f072D4e0c2eEbABC08'
    );

    const seedPrice = priceData.data.coins[`${chain}:${SEED_TOKEN}`]?.price || 0;

    // Calculate TVL
    const tvlUsd = (balance.output / (10 ** decimals.output)) * seedPrice;

    return [{
      pool: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf-base',
      chain: utils.formatChain(chain),
      project: 'garden',
      symbol: utils.formatSymbol('SEED'),
      tvlUsd: tvlUsd,
      apy: apyData.data,
    }];

  } catch (error) {
    console.error('Error in getTvl:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: getTvl,
  url: 'https://app.garden.finance/stake',
};