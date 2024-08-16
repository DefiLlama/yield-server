const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { ethers } = require('ethers');
const fetch = require('node-fetch');

const liquidity_endpoint = sdk.graph.modifyEndpoint('BgVpYLQVGwb2RRPcW66aLBtmv48w9NwGxhypBMRNDi34');
const pricing_endpoint = sdk.graph.modifyEndpoint('39DkzkpLtF3xJTWgpZwnSKPqqnHbErYhHTVh7RCZ6SMN');
const zETH = '0x776280f68ad33c4d49e6846507b7dbaf7811c89f';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const query_liquidity = `{
    zeroLiquids {
        amountETH
        amountZETH
        amountETHPOL
        amountZETHPOL
        currentMiningReward
      }
    }`;

const query_price = `{
    zethPrice : token(id: "${zETH}") {
        drivedUSD
        name
      }
     wethPrice : token(id: "${WETH}") {
        drivedUSD
        name
      }
}`;

const poolsFunction = async () => {
  const data_liquidity = await fetch(liquidity_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: query_liquidity }),
  })
    .then((r) => r.json())
    .then((data) => {
      return data.data.zeroLiquids[0];
    });

  const data_pricing = await fetch(pricing_endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query: query_price }),
  })
    .then((r) => r.json())
    .then((data) => {
      return data.data;
    });

  console.log(data_pricing, 'data_lllll');

  const zethPool = {
    pool: '0xb2C57D651dB0FcCc96cABda11191DF25E05B88b6',
    chain: utils.formatChain('Ethereum'),
    project: 'zeroliquid',
    symbol: utils.formatSymbol('zETH-WETH'),
    tvlUsd:
      (data_pricing.zethPrice.drivedUSD * data_liquidity.amountZETH) / 1e18 +
      (data_pricing.wethPrice.drivedUSD * data_liquidity.amountETH) / 1e18,
    apy:
      ((data_liquidity.currentMiningReward * 12) /
        (data_liquidity.amountETH -
          data_liquidity.amountETHPOL +
          (data_liquidity.amountZETH - data_liquidity.amountZETHPOL))) *
      100,
  };

  return [zethPool]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.zeroliquid.xyz/earn',
};
