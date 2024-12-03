const axios = require('axios');
const utils = require('../utils');

const CLIENT_ID = "726755f8-ff00-4376-ad3a-259537bfac80"
const CLIENT_KEY = "736a9e0729bac973ebd5b4df653ba133c5ee7c105852ce111eb74bd7f7e94c56"

const getApy = async () => {
  const reserveApys = [];
  const req = (await axios.get(`https://nebula.pluto.so/v1/earn/vaults`, {
    headers: {
      'x-client-id': CLIENT_ID,
      'authorization': 'Bearer '+CLIENT_KEY
    }
  }));
  const reserves = req.data.data;

  reserveApys.push(
    ...reserves.map((r) => {
      return {
        pool: r.earn_vault_address,
        chain: 'Solana',
        project: 'pluto',
        symbol: utils.formatSymbol(r.symbol),
        tvlUsd: Number(r.supply_amount_usd),
        url: `https://app.pluto.so/earn/`,
        apyBase: Number(r.supply_apy),
        totalSupplyUsd: Number(r.supply_amount_usd),
        totalBorrowUsd: Number(r.borrowed_amount_usd),
        apyBaseBorrow: Number(r.borrow_apy),
      };
    })
  );

  return reserveApys;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://pluto.so/',
};
