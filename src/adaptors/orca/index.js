const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
  let pools = (await axios.get('https://api.orca.so/pools')).data;
  let whirlpools = (
    await axios.get('https://api.mainnet.orca.so/v1/whirlpool/list')
  ).data.whirlpools;

  pools = pools.map((p) => {
    const name = p.name.split('[');

    return {
      pool: p.account,
      chain: 'Solana',
      project: 'orca',
      symbol: utils.formatSymbol(name[0]),
      tvlUsd: p.liquidity,
      apy: p.apy_24h * 100,
      volumeUsd1d: p.volume_24h,
      volumeUsd7d: p.volume_7d,
      poolMeta: name.length > 0 ? 'Aquafarm' : null,
    };
  });

  whirlpools = whirlpools.map((p) => {
    const apyReward =
      (p.reward0Apr?.day + p.reward1Apr?.day + p.reward2Apr?.day) * 100;

    return {
      pool: p.address,
      chain: 'Solana',
      project: 'orca',
      symbol: utils.formatSymbol(`${p.tokenA.symbol}-${p.tokenB.symbol}`),
      underlyingTokens: [p.tokenA.mint, p.tokenB.mint],
      rewardTokens:
        apyReward > 0 ? ['orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE'] : [],
      tvlUsd: p.tvl,
      apyBase: p.feeApr?.day * 100,
      apyBase7d: p.feeApr?.week * 100,
      apyReward: apyReward > 0 ? apyReward : null,
      volumeUsd1d: p.volume?.day,
      volumeUsd7d: p.volume?.week,
      poolMeta: 'Whirlpool',
    };
  });

  return pools.concat(whirlpools).filter((p) => utils.keepFinite(p));
};

module.exports = {
  apy: getApy,
  url: 'https://www.orca.so/pools',
};
