const { default: BigNumber } = require('bignumber.js');

const utils = require('../utils');

const AMNIS_RESOURCE_ACCOUNT ='0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a';
const NODE_URL = 'https://fullnode.mainnet.aptoslabs.com/v1';
const COINS_LLAMA_PRICE_URL = 'https://coins.llama.fi/prices/current/';
const DECIMALS = 1e8;
const axios = require('axios');


const aptosCoinName = 'coingecko:aptos';

async function main() {
    //calculate apy
    const { data: { rewards_rate, rewards_rate_denominator } } = await utils.getData(`${NODE_URL}/accounts/0x1/resource/0x1::staking_config::StakingConfig`)
    const amStakedData = await utils.getData(`${NODE_URL}/view`, {"function": `${AMNIS_RESOURCE_ACCOUNT}::stapt_token::total_amapt_staked`,"type_arguments": [],"arguments": []})
    const amStaked = amStakedData[0]
    const amTotalSupplyData = await utils.getData(`${NODE_URL}/view`, {"function": `${AMNIS_RESOURCE_ACCOUNT}::amapt_token::total_supply`,"type_arguments": [],"arguments": []})
    const amTotalSupply = amTotalSupplyData[0]
    const apy = (Math.pow(1 + rewards_rate * amTotalSupply / amStaked / rewards_rate_denominator, 12 * 365) - 1) * 100;

    //calculate tvlUsd
    let tvlUsd = 0
    const aptPrice = await utils.getData(`${COINS_LLAMA_PRICE_URL}${aptosCoinName}`)
    const { data: { supply } } = await utils.getData(`${NODE_URL}/accounts/${AMNIS_RESOURCE_ACCOUNT}/resource/0x1::coin::CoinInfo%3C${AMNIS_RESOURCE_ACCOUNT}::amapt_token::AmnisApt%3E`)
    tvlUsd = supply.vec[0].integer.vec[0].value/1e8 * aptPrice.coins[aptosCoinName].price

    return [
        {
          pool: `${AMNIS_RESOURCE_ACCOUNT}-amnis-finance`,
          chain: utils.formatChain('aptos'),
          project: 'amnis-finance',
          symbol: utils.formatSymbol('apt'),
          tvlUsd: tvlUsd,
          apy: apy,
          apyBase: apy,
        },
      ];
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://amnis.finance',
};