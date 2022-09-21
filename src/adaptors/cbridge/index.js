const utils = require('../utils');

const buildPool = (entry) => {
  const newObj = {
    pool: `${entry.token.token.symbol}-${entry.chain.id}`,
    chain: utils.formatChain(entry.chainString),
    project: 'cbridge',
    symbol: utils.formatSymbol(entry.token.token.symbol),
    tvlUsd: entry.total_liquidity,
    apyBase: entry.lp_fee_earning_apy * 100,
    apyReward: entry.farming_apy * 100,
    rewardTokens: entry.farming_session_tokens.map((t) => t.token.address),
    underlyingTokens: [entry.token.token.address],
  };

  return newObj;
};

const topLvl = async () => {
  // using our chain names
  const chainMapping = await utils.getData('https://api.llama.fi/chains');

  const url = 'https://cbridge-prod2.celer.network/v1/getLPInfoList';
  let data = (await utils.getData(url)).lp_info;
  for (const el of data) {
    el['chainString'] = chainMapping.find(
      (x) => x.chainId === el.chain.id
    )?.name;
  }
  data = data.filter((el) => el.chainString !== undefined);
  data = data.map((el) => buildPool(el));

  return data;
};

const main = async () => {
  const data = await topLvl();
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://cbridge.celer.network/liquidity',
};
