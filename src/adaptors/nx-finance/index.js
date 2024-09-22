const axios = require('axios');
const utils = require('../utils');

const getApy = async () => {
  const reserveApys = [];
  const reserves = (await axios.get(`https://nxfinance.io/linux/api/data/pool-info`)).data.data;

  reserveApys.push(
    ...reserves.map((r) => {
        let poolName = ''
        if(r.version === 1) poolName = 'Fulcrum Lending Pool'
        if(r.version === 2) poolName = 'GMS Lending Pool'

        const totalSupplyUsd = Number(r.lendingPoolInfo[0].totalSupplyUsd)
        const totalBorrowUsd = Number(r.lendingPoolInfo[0].totalBorrowUsd)
      return {
        pool: poolName + ' - ' + r.symbol,
        chain: 'Solana',
        project: 'nx-finance',
        symbol: utils.formatSymbol(r.symbol),
        tvlUsd: totalSupplyUsd - totalBorrowUsd,
        url: `https://nxfinance.io/lend/`,
        apyBase: Number(r.lendingPoolInfo[0].APR) * 100,
        totalSupplyUsd: totalSupplyUsd,
        totalBorrowUsd: totalBorrowUsd,
        apyBaseBorrow: Number(r.lendingPoolInfo[0].borrowAPR) * 100,
      };
    })
  );

  return reserveApys;
};

module.exports = {
  apy: getApy,
  url: 'https://nxfinance.io/',
};
