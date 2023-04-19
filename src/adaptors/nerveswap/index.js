const axios = require('axios');
const utils = require('../utils');
const { BigNumber } = require("bignumber.js");
const baseURL = "https://api.swap.nerve.network/swap";

const getApy = async () => {
  let pools = (await axios.get(baseURL + '/pools')).data.data.list;
  pools = pools.map((p) => {
    const apyReward = Number(p.lpMintingAPR);
    return {
      pool: p.address,
      chain: 'Nuls',
      project: 'nerveswap',
      symbol: utils.formatSymbol(`${p.token0Symbol}-${p.token1Symbol}`),
      tvlUsd: Number(new BigNumber(p.reserveUsdtValue).shiftedBy(-18).toFixed(6)),
      apyBase: p.feeUsdtValueARP / 100,
      apyReward: apyReward > 0 ? apyReward : null,
      rewardTokens: apyReward > 0 ? [] : [],
      volumeUsd1d: Number(new BigNumber(p.amountUsdtValue24H).shiftedBy(-18).toFixed(6)),
      volumeUsd7d: Number(new BigNumber(p.amountUsdtValue7D).shiftedBy(-18).toFixed(6)),
      poolMeta: null
    };
  });
  return pools;
};

module.exports = {
  apy: getApy,
  url: 'https://nerve.network/info/pools',
};
