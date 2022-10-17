const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');

const buildPool = (index, apy) => {
  const chain = utils.formatChain(index.chain);
  const symbol = utils.formatSymbol(index.symbol);
  return {
    pool: `${index.address}-${chain}`.toLowerCase(),
    chain,
    project: 'index-coop',
    symbol,
    tvlUsd: 0,
    apy,
  };
};

const main = async () => {
  const icEthIndex = {
    address: '0x7C07F7aBe10CE8e33DC6C5aD68FE033085256A84',
    chain: 'Ethereum',
    symbol: 'icETH',
  };

  // Will only work from defillama.com domain (others can be requested)
  const { apy } = await utils.getData('https://api.indexcoop.com/iceth/apy');
  const apyNumber = BigNumber(apy).div(1e18).toNumber();

  const icEth = buildPool(icEthIndex, apyNumber);
  return [icEth];
};

export default {
  timetravel: false,
  apy: main,
  url: 'https://app.indexcoop.com/products',
};
