const axios = require('axios');
const { BigNumber } = require("bignumber.js");
const baseURL = "https://pocm.nuls.io/api/pocm";

const main = async () => {
  let pools = (await axios.get(baseURL + '/pools')).data.data;
  const priceKey = 'enuls:0x0000000000000000000000000000000000000000';
  const nulsPrice = (
      await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  pools = pools.map((p) => {
    const deposit = new BigNumber(p.totalDeposit).shiftedBy(-8);
    return {
      pool: p.id + '-' + p.contractAddress,
      chain: 'Nuls',
      project: 'nuls-pocm',
      symbol: p.name,
      tvlUsd: Number(deposit.multipliedBy(nulsPrice).toFixed(6)),
      apyBase: Number(p.apr)
    };
  });
  return pools;
};

module.exports = {
  apy: main,
  url: 'https://pocm.nuls.io/pocm/Projects/ProjectsList',
};
