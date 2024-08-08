const sdk = require('@defillama/sdk');
const axios = require('axios');

const abisAVAXOracle = require('./abisAVAXOracle');
const abisAVAXTreasury = require('./abisAVAXTreasury');
const abiRebalancePool = require('./abirebalancePool.js');
const abiAUSD = require('./abiAUSD');
const { apyBase } = require('../barnbridge/numbers');
const { rewardTokens } = require('../sommelier/config');

const sAVAX = 'avax:0x2b2c81e08f1af8835a78bb2a90ae924ace0ea4be';
const sAVAXTreasury = '0xDC325ad34C762C19FaAB37d439fbf219715f9D58';
const sAVAXOracle = '0x600466c3c707A75129C7B7BC280e5A00C219fEF0';
const aUSD = '0xaBe7a9dFDA35230ff60D1590a929aE0644c47DC1';
const rebalancePool = '0x0363a3deBe776de575C36F524b7877dB7dd461Db';

const getAPR = async () => {
  return (await axios.get('https://api.benqi.fi/liquidstaking/apr')).data.apr;
};

const getTreasuryTotalwsAVAX = async () => {
  return (
    (
      await sdk.api.abi.call({
        target: sAVAXTreasury,
        abi: abisAVAXTreasury.find((m) => m.name === 'totalBaseToken'),
        chain: 'avax',
        params: [],
      })
    ).output / 1e18
  );
};

// this returns the ratio of sAVAX to wsAVAX
const getWSAVAXtoSAVAXRatio = async () => {
  const wsAVAXPrice = await sdk.api.abi.call({
    target: sAVAXOracle,
    abi: abisAVAXOracle.find((m) => m.name === 'getData'),
    chain: 'avax',
    params: [],
  });

  return wsAVAXPrice.output[0] / 1e18;
};

const getSAVAXPrice = async () => {
  return (await axios.get(`https://coins.llama.fi/prices/current/${sAVAX}`))
    .data.coins[sAVAX].price;
};

const getaUSDPrice = async () => {
  return (
    (
      await sdk.api.abi.call({
        target: aUSD,
        abi: abiAUSD.find((m) => m.name == 'nav'),
        chain: 'avax',
        params: [],
      })
    ).output / 1e18
  );
};

const getRPoolTotalSupply = async () => {
  return (
    (
      await sdk.api.abi.call({
        target: rebalancePool,
        abi: abiRebalancePool.find((m) => m.name === 'totalSupply'),
        chain: 'avax',
      })
    ).output / 1e18
  );
};

const pool = '0x0363a3deBe776de575C36F524b7877dB7dd461Db-avax'.toLowerCase();
async function main() {
  const totalwsAVAX = await getTreasuryTotalwsAVAX();
  const wsAVAXPrice = await getWSAVAXtoSAVAXRatio();
  const sAVAXPrice = await getSAVAXPrice();
  const APR = await getAPR();
  const rPoolSupply = await getRPoolTotalSupply();
  const aUSDPrice = await getaUSDPrice();

  const sAVAXTVL = (totalwsAVAX / wsAVAXPrice) * sAVAXPrice;
  const rPoolTVL = rPoolSupply * aUSDPrice;
  const protocolAPR = (sAVAXTVL / rPoolTVL) * APR;
  const rPoolAPR = protocolAPR * 0.9 * 100;

  return [
    {
      pool: pool,
      chain: 'avax',
      project: 'stable-jack',
      symbol: 'aUSD',
      tvlUsd: rPoolTVL,
      apyBase: rPoolAPR,
      rewardTokens: [sAVAX],
    },
  ];
}

module.exports = {
  apy: main,
  url: 'https://app.stablejack.xyz/rebalancepool',
};
