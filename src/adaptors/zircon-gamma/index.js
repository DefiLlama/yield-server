const axios = require('axios');
const utils = require('../utils');

async function apy(chain) {
  const response = (
    await axios.get(
      `https://edgeapi.zircon.finance/static/yield`
    )
  ).data;

  const pools = response.map((p) => ({
    pool: `${p.stakedToken}-moonriver`.toLowerCase(),
    chain: 'moonriver',
    project: 'zircon-gamma',
    symbol: `${p.isAnchor ?  'S-' : 'F-'}${p.tokenSymbol} ${p.underlyingTokensSymbol.join("-")}`,
    tvlUsd: Number(p.tvl),
    apyBase: Number(p.feesAPR),
    apyReward: Number(p.apr),
    rewardTokens: p.rewardTokens,
    underlyingTokens: p.underlyingTokens
  }));


  return [
    ...pools,
  ];
}

const main = async () => {
  const [movr] = await Promise.all([apy()]);
  return [...movr];
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.app.zircon.finance/#/farm',
};
