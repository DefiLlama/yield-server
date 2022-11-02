const { vaults, ChainId, FRONTEND } = require('./vaults');

const main = async () => {
  const eth = vaults[ChainId.MAINNET].filter((e) => e.version === 2);
  console.log(eth);
  return [];
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://app.mai.finance/',
};
