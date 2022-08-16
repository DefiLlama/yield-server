const utils = require('../utils');
const mainnetPoolsUrl =
  'https://api.idle.finance/pools?api-key=bPrtC2bfnAvapyXLgdvzVzW8u8igKv6E';
const polygonPoolsUrl =
  'https://api-polygon.idle.finance/pools?api-key=bPrtC2bfnAvapyXLgdvzVzW8u8igKv6E';
const chains = {
  eth: 'ethereum',
  matic: 'polygon',
};

async function apy() {
  const mainnetPoolsResponse = await utils.getData(mainnetPoolsUrl);
  const polygonPoolsResponse = await utils.getData(polygonPoolsUrl);

  const poolsResponse = {
    matic: polygonPoolsResponse,
    eth: mainnetPoolsResponse,
  };

  let allVaults = [];

  for (let chain of Object.keys(chains)) {
    const chainPools = Object.values(poolsResponse[chain]);

    const pools = chainPools.map((v) => {
      var poolNameParts = v.poolName.split(' ');
      let poolName = (
        utils.formatSymbol(poolNameParts[0].toUpperCase()) +
        ' ' +
        poolNameParts.slice(1, poolNameParts.length).join(' ')
      ).trim();
      return {
        pool: v.address,
        apy: Number(v.apr),
        symbol: poolName.replace('-LP', ' LP'),
        tvlUsd: Number(v.tvl),
        project: 'idle-finance',
        chain: utils.formatChain(chains[chain]),
      };
    });

    allVaults = [...allVaults, ...pools];
  }

  return allVaults;
}

const main = async () => {
  return await apy();
};

module.exports = {
  apy: main,
  timetravel: false,
};
